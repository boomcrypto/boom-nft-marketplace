;; Boom NFT Marketplace - Complete Smart Contract with Analytics
;; A secondary NFT marketplace with marketplace fees and comprehensive analytics events

(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(use-trait ft-trait  'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; ==========================================
;; CONSTANTS AND VARIABLES
;; ==========================================

(define-constant contract-owner tx-sender)

;; Listing errors
(define-constant ERR_EXPIRY_IN_PAST (err u1000))
(define-constant ERR_PRICE_ZERO (err u1001))

;; Cancelling and fulfiling errors
(define-constant ERR_UNKNOWN_LISTING (err u2000))
(define-constant ERR_UNAUTHORISED (err u2001))
(define-constant ERR_LISTING_EXPIRED (err u2002))
(define-constant ERR_NFT_ASSET_MISMATCH (err u2003))
(define-constant ERR_PAYMENT_ASSET_MISMATCH (err u2004))
(define-constant ERR_MAKER_TAKER_EQUAL (err u2005))
(define-constant ERR_UNINTENDED_TAKER (err u2006))
(define-constant ERR_ASSET_CONTRACT_NOT_WHITELISTED (err u2007))
(define-constant ERR_PAYMENT_CONTRACT_NOT_WHITELISTED (err u2008))

;; Fee errors
(define-constant ERR_INVALID_FEE_RATE (err u3001))
(define-constant ERR_INSUFFICIENT_FUNDS (err u3002))

;; Marketplace fee rate in basis points (250 = 2.5%)
(define-data-var marketplace-fee-rate uint u250)

;; Admin wallet for fee collection
(define-data-var admin-wallet principal contract-owner)

;; Used for unique IDs for each listing
(define-data-var listing-nonce uint u0)

;; ==========================================
;; DATA MAPS
;; ==========================================

;; Define a map data structure for the asset listings
(define-map listings
  uint
  {
    maker: principal,
    taker: (optional principal),
    token-id: uint,
    nft-asset-contract: principal,
    expiry: uint,
    price: uint,
    payment-asset-contract: (optional principal)
  }
)

;; Additional metadata for analytics
(define-map listing-metadata uint {
  listed-at-block: uint,
  category: (string-ascii 20),
  collection-name: (optional (string-ascii 50))
})

;; User reputation tracking
(define-map user-reputation principal {
  total-sales: uint,
  total-purchases: uint,
  completion-rate: uint ;; percentage * 100
})

;; This marketplace requires any contracts used for assets or payments to be whitelisted
;; by the contract owner of this (marketplace) contract.
(define-map whitelisted-asset-contracts principal bool)

;; ==========================================
;; READ-ONLY FUNCTIONS
;; ==========================================

;; Function that checks if the given contract has been whitelisted.
(define-read-only (is-whitelisted (asset-contract principal))
  (default-to false (map-get? whitelisted-asset-contracts asset-contract))
)

;; Public read-only function to retrieve a listing by its ID
(define-read-only (get-listing (listing-id uint))
  (map-get? listings listing-id)
)

;; Get listing metadata
(define-read-only (get-listing-metadata (listing-id uint))
  (map-get? listing-metadata listing-id)
)

;; Get user reputation
(define-read-only (get-user-reputation (user principal))
  (map-get? user-reputation user)
)

;; Get current marketplace fee rate
(define-read-only (get-marketplace-fee-rate)
  (var-get marketplace-fee-rate)
)

;; Get admin wallet
(define-read-only (get-admin-wallet)
  (var-get admin-wallet)
)

;; Calculate marketplace fee for a given price
(define-read-only (calculate-marketplace-fee (price uint))
  (/ (* price (var-get marketplace-fee-rate)) u10000)
)

;; Calculate net amount to seller after fees
(define-read-only (calculate-net-to-seller (price uint))
  (- price (calculate-marketplace-fee price))
)

;; ==========================================
;; PRIVATE FUNCTIONS
;; ==========================================

;; Internal function to transfer an NFT asset from a sender to a given recipient.
(define-private (transfer-nft
  (token-contract <nft-trait>)
  (token-id uint)
  (sender principal)
  (recipient principal)
)
  (contract-call? token-contract transfer token-id sender recipient)
)

;; Internal function to transfer fungible tokens from a sender to a given recipient.
(define-private (transfer-ft
  (token-contract <ft-trait>)
  (amount uint)
  (sender principal)
  (recipient principal)
)
  (contract-call? token-contract transfer amount sender recipient none)
)

;; Private function to validate that a purchase can be fulfilled
(define-private (assert-can-fulfil
  (nft-asset-contract principal)
  (payment-asset-contract (optional principal))
  (listing {
    maker: principal,
    taker: (optional principal),
    token-id: uint,
    nft-asset-contract: principal,
    expiry: uint,
    price: uint,
    payment-asset-contract: (optional principal)
  })
)
  (begin
    ;; Verify that the buyer is not the same as the NFT creator
    (asserts! (not (is-eq (get maker listing) tx-sender)) ERR_MAKER_TAKER_EQUAL)
    ;; Verify the buyer has been set in the listing metadata as its `taker`
    (asserts!
      (match (get taker listing) intended-taker (is-eq intended-taker tx-sender) true)
      ERR_UNINTENDED_TAKER
    )
    ;; Verify the listing for purchase is not expired
    (asserts! (< burn-block-height (get expiry listing)) ERR_LISTING_EXPIRED)
    ;; Verify the asset contract used to purchase the NFT is the same as the one set on the NFT
    (asserts! (is-eq (get nft-asset-contract listing) nft-asset-contract) ERR_NFT_ASSET_MISMATCH)
    ;; Verify the payment contract used to purchase the NFT is the same as the one set on the NFT
    (asserts!
      (is-eq (get payment-asset-contract listing) payment-asset-contract)
      ERR_PAYMENT_ASSET_MISMATCH
    )
    (ok true)
  )
)

;; Update user reputation after transaction
(define-private (update-user-reputation (user principal) (action (string-ascii 10)) (successful bool))
  (let (
    (current-stats (default-to 
      {total-sales: u0, total-purchases: u0, completion-rate: u100}
      (map-get? user-reputation user)
    ))
    (new-sales (if (is-eq action "sale") (+ (get total-sales current-stats) u1) (get total-sales current-stats)))
    (new-purchases (if (is-eq action "purchase") (+ (get total-purchases current-stats) u1) (get total-purchases current-stats)))
    (total-transactions (+ new-sales new-purchases))
    (successful-transactions (if successful total-transactions (- total-transactions u1)))
    (new-completion-rate (if (> total-transactions u0) (/ (* successful-transactions u100) total-transactions) u100))
  )
    ;; Analytics event for user activity
    (print {
      event: "user-activity",
      user: user,
      action: action,
      successful: successful,
      block-height: burn-block-height,
      previous-completion-rate: (get completion-rate current-stats),
      new-completion-rate: new-completion-rate
    })
    
    ;; Update user reputation
    (map-set user-reputation user {
      total-sales: new-sales,
      total-purchases: new-purchases,
      completion-rate: new-completion-rate
    })
    
    (ok true)
  )
)

;; ==========================================
;; ADMIN FUNCTIONS
;; ==========================================

;; Only the contract owner of this (marketplace) contract can whitelist an asset contract.
(define-public (set-whitelisted (asset-contract principal) (whitelisted bool))
  (begin
    (asserts! (is-eq contract-owner tx-sender) ERR_UNAUTHORISED)
    
    ;; Analytics event for whitelist change
    (print {
      event: "whitelist-updated",
      asset-contract: asset-contract,
      whitelisted: whitelisted,
      updated-by: tx-sender,
      block-height: burn-block-height
    })
    
    (ok (map-set whitelisted-asset-contracts asset-contract whitelisted))
  )
)

;; Set marketplace fee rate (only admin)
(define-public (set-marketplace-fee-rate (new-rate uint))
  (let ((old-rate (var-get marketplace-fee-rate)))
    (asserts! (is-eq contract-owner tx-sender) ERR_UNAUTHORISED)
    (asserts! (<= new-rate u1000) ERR_INVALID_FEE_RATE) ;; Max 10%
    
    ;; Analytics event for fee rate change
    (print {
      event: "fee-rate-changed",
      old-rate: old-rate,
      new-rate: new-rate,
      changed-by: tx-sender,
      block-height: burn-block-height
    })
    
    (var-set marketplace-fee-rate new-rate)
    (ok true)
  )
)

;; Set admin wallet (only current admin)
(define-public (set-admin-wallet (new-admin principal))
  (let ((old-admin (var-get admin-wallet)))
    (asserts! (is-eq contract-owner tx-sender) ERR_UNAUTHORISED)
    
    ;; Analytics event for admin change
    (print {
      event: "admin-changed",
      old-admin: old-admin,
      new-admin: new-admin,
      changed-by: tx-sender,
      block-height: burn-block-height
    })
    
    (var-set admin-wallet new-admin)
    (ok true)
  )
)

;; ==========================================
;; LISTING FUNCTIONS
;; ==========================================

;; Enhanced public function to list an asset with analytics
(define-public (list-asset
  (nft-asset-contract <nft-trait>)
  (nft-asset {
    taker: (optional principal),
    token-id: uint,
    expiry: uint,
    price: uint,
    payment-asset-contract: (optional principal)
  })
  (category (string-ascii 20))
  (collection-name (optional (string-ascii 50)))
)
  (let ((listing-id (var-get listing-nonce)))
    ;; Verify that the contract of this asset is whitelisted
    (asserts! (is-whitelisted (contract-of nft-asset-contract)) ERR_ASSET_CONTRACT_NOT_WHITELISTED)
    ;; Verify that the asset is not expired
    (asserts! (> (get expiry nft-asset) burn-block-height) ERR_EXPIRY_IN_PAST)
    ;; Verify that the asset price is greater than zero
    (asserts! (> (get price nft-asset) u0) ERR_PRICE_ZERO)
    ;; Verify that the contract of the payment is whitelisted
    (asserts! (match (get payment-asset-contract nft-asset)
      payment-asset
      (is-whitelisted payment-asset)
      true
    ) ERR_PAYMENT_CONTRACT_NOT_WHITELISTED)
    
    ;; Transfer the NFT ownership to this contract's principal
    (try! (transfer-nft
      nft-asset-contract
      (get token-id nft-asset)
      tx-sender
      (as-contract tx-sender)
    ))
    
    ;; List the NFT in the listings map
    (map-set listings listing-id (merge
      { maker: tx-sender, nft-asset-contract: (contract-of nft-asset-contract) }
      nft-asset
    ))
    
    ;; Store listing metadata for analytics
    (map-set listing-metadata listing-id {
      listed-at-block: burn-block-height,
      category: category,
      collection-name: collection-name
    })
    
    ;; Analytics event: NFT Listed
    (print {
      event: "nft-listed",
      listing-id: listing-id,
      seller: tx-sender,
      nft-contract: (contract-of nft-asset-contract),
      token-id: (get token-id nft-asset),
      price: (get price nft-asset),
      payment-token: (match (get payment-asset-contract nft-asset)
        token (principal-to-string token)
        "STX"
      ),
      category: category,
      collection-name: collection-name,
      expiry-block: (get expiry nft-asset),
      block-height: burn-block-height,
      intended-taker: (get taker nft-asset)
    })
    
    ;; Increment the nonce to use for the next unique listing ID
    (var-set listing-nonce (+ listing-id u1))
    
    ;; Update user reputation for listing
    (try! (update-user-reputation tx-sender "listing" true))
    
    ;; Return the created listing ID
    (ok listing-id)
  )
)

;; ==========================================
;; CANCELLATION FUNCTIONS
;; ==========================================

;; Public function to cancel a listing using an asset contract.
(define-public (cancel-listing (listing-id uint) (nft-asset-contract <nft-trait>))
  (let (
    (listing (unwrap! (map-get? listings listing-id) ERR_UNKNOWN_LISTING))
    (metadata (map-get? listing-metadata listing-id))
    (maker (get maker listing))
  )
    ;; Verify that the caller of the function is the creator of the NFT to be cancelled
    (asserts! (is-eq maker tx-sender) ERR_UNAUTHORISED)
    ;; Verify that the asset contract to use is the same one that the NFT uses
    (asserts! (is-eq
      (get nft-asset-contract listing)
      (contract-of nft-asset-contract)
    ) ERR_NFT_ASSET_MISMATCH)
    
    ;; Analytics event: Listing Cancelled
    (print {
      event: "listing-cancelled",
      listing-id: listing-id,
      seller: maker,
      nft-contract: (get nft-asset-contract listing),
      token-id: (get token-id listing),
      original-price: (get price listing),
      category: (match metadata data (get category data) "unknown"),
      collection-name: (match metadata data (get collection-name data) none),
      listed-at-block: (match metadata data (get listed-at-block data) u0),
      cancelled-at-block: burn-block-height,
      time-listed: (match metadata data (- burn-block-height (get listed-at-block data)) u0)
    })
    
    ;; Delete the listing and metadata
    (map-delete listings listing-id)
    (map-delete listing-metadata listing-id)
    
    ;; Update user reputation for cancellation
    (try! (update-user-reputation tx-sender "cancellation" true))
    
    ;; Transfer the NFT from this contract's principal back to the creator's principal
    (as-contract (transfer-nft nft-asset-contract (get token-id listing) tx-sender maker))
  )
)

;; ==========================================
;; FULFILLMENT FUNCTIONS
;; ==========================================

;; Public function to purchase a listing using STX as payment
(define-public (fulfil-listing-stx (listing-id uint) (nft-asset-contract <nft-trait>))
  (let (
    ;; Verify the given listing ID exists
    (listing (unwrap! (map-get? listings listing-id) ERR_UNKNOWN_LISTING))
    (metadata (map-get? listing-metadata listing-id))
    ;; Set the NFT's taker to the purchaser (caller of the function)
    (taker tx-sender)
    (maker (get maker listing))
    (sale-price (get price listing))
    (marketplace-fee (calculate-marketplace-fee sale-price))
    (net-to-seller (- sale-price marketplace-fee))
    (admin (var-get admin-wallet))
  )
    ;; Validate that the purchase can be fulfilled
    (try! (assert-can-fulfil (contract-of nft-asset-contract) none listing))
    
    ;; Transfer the marketplace fee to admin wallet
    (if (> marketplace-fee u0)
      (try! (stx-transfer? marketplace-fee taker admin))
      true
    )
    
    ;; Transfer the remaining STX payment from the purchaser to the seller
    (try! (stx-transfer? net-to-seller taker maker))
    
    ;; Transfer the NFT to the purchaser (caller of the function)
    (try! (as-contract (transfer-nft nft-asset-contract (get token-id listing) tx-sender taker)))
    
    ;; Analytics event: NFT Sold
    (print {
      event: "nft-sold",
      listing-id: listing-id,
      seller: maker,
      buyer: taker,
      nft-contract: (get nft-asset-contract listing),
      token-id: (get token-id listing),
      sale-price: sale-price,
      marketplace-fee: marketplace-fee,
      net-to-seller: net-to-seller,
      payment-token: "STX",
      category: (match metadata data (get category data) "unknown"),
      collection-name: (match metadata data (get collection-name data) none),
      listed-at-block: (match metadata data (get listed-at-block data) u0),
      sold-at-block: burn-block-height,
      time-to-sale: (match metadata data (- burn-block-height (get listed-at-block data)) u0)
    })
    
    ;; Analytics event: Fee Collected
    (if (> marketplace-fee u0)
      (print {
        event: "fee-collected",
        listing-id: listing-id,
        fee-amount: marketplace-fee,
        fee-rate: (var-get marketplace-fee-rate),
        payment-token: "STX",
        block-height: burn-block-height,
        admin-wallet: admin
      })
      true
    )
    
    ;; Update user reputations
    (try! (update-user-reputation maker "sale" true))
    (try! (update-user-reputation taker "purchase" true))
    
    ;; Remove the NFT from the marketplace listings
    (map-delete listings listing-id)
    (map-delete listing-metadata listing-id)
    
    ;; Return the listing ID that was just purchased
    (ok listing-id)
  )
)

;; Public function to purchase a listing using another fungible token as payment (including sBTC)
(define-public (fulfil-listing-ft
  (listing-id uint)
  (nft-asset-contract <nft-trait>)
  (payment-asset-contract <ft-trait>)
)
  (let (
    ;; Verify the given listing ID exists
    (listing (unwrap! (map-get? listings listing-id) ERR_UNKNOWN_LISTING))
    (metadata (map-get? listing-metadata listing-id))
    ;; Set the NFT's taker to the purchaser (caller of the function)
    (taker tx-sender)
    (maker (get maker listing))
    (sale-price (get price listing))
    (marketplace-fee (calculate-marketplace-fee sale-price))
    (net-to-seller (- sale-price marketplace-fee))
    (admin (var-get admin-wallet))
    (payment-token-name (principal-to-string (contract-of payment-asset-contract)))
  )
    ;; Validate that the purchase can be fulfilled
    (try! (assert-can-fulfil
      (contract-of nft-asset-contract)
      (some (contract-of payment-asset-contract))
      listing
    ))
    
    ;; Transfer the marketplace fee to admin wallet
    (if (> marketplace-fee u0)
      (try! (transfer-ft payment-asset-contract marketplace-fee taker admin))
      true
    )
    
    ;; Transfer the remaining tokens as payment from the purchaser to the seller
    (try! (transfer-ft payment-asset-contract net-to-seller taker maker))
    
    ;; Transfer the NFT to the purchaser (caller of the function)
    (try! (as-contract (transfer-nft nft-asset-contract (get token-id listing) tx-sender taker)))
    
    ;; Analytics event: NFT Sold (Token Payment)
    (print {
      event: "nft-sold",
      listing-id: listing-id,
      seller: maker,
      buyer: taker,
      nft-contract: (get nft-asset-contract listing),
      token-id: (get token-id listing),
      sale-price: sale-price,
      marketplace-fee: marketplace-fee,
      net-to-seller: net-to-seller,
      payment-token: payment-token-name,
      category: (match metadata data (get category data) "unknown"),
      collection-name: (match metadata data (get collection-name data) none),
      listed-at-block: (match metadata data (get listed-at-block data) u0),
      sold-at-block: burn-block-height,
      time-to-sale: (match metadata data (- burn-block-height (get listed-at-block data)) u0)
    })
    
    ;; Analytics event: Fee Collected (Token)
    (if (> marketplace-fee u0)
      (print {
        event: "fee-collected",
        listing-id: listing-id,
        fee-amount: marketplace-fee,
        fee-rate: (var-get marketplace-fee-rate),
        payment-token: payment-token-name,
        block-height: burn-block-height,
        admin-wallet: admin
      })
      true
    )
    
    ;; Update user reputations
    (try! (update-user-reputation maker "sale" true))
    (try! (update-user-reputation taker "purchase" true))
    
    ;; Remove the NFT from the marketplace listings
    (map-delete listings listing-id)
    (map-delete listing-metadata listing-id)
    
    ;; Return the listing ID that was just purchased
    (ok listing-id)
  )
)

;; ==========================================
;; UTILITY FUNCTIONS
;; ==========================================

;; Emit market summary for analytics (can be called by anyone)
(define-public (emit-market-summary)
  (let (
    (current-nonce (var-get listing-nonce))
    (current-fee-rate (var-get marketplace-fee-rate))
  )
    ;; Analytics event: Market Summary
    (print {
      event: "market-summary",
      total-listings-created: current-nonce,
      current-fee-rate: current-fee-rate,
      admin-wallet: (var-get admin-wallet),
      block-height: burn-block-height,
      contract-address: (as-contract tx-sender)
    })
    (ok true)
  )
)

;; Convert principal to string (helper function)
(define-private (principal-to-string (p principal))
  ;; This is a simplified version - in practice you might want more sophisticated conversion
  ;; For analytics purposes, you could just use the principal directly
  (if (is-eq p 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) "STX" "TOKEN")
)
