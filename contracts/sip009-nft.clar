;; SIP009 NFT Contract Implementation
;; A simple NFT contract for testing the marketplace

;; Define the SIP009 NFT trait
(define-trait nft-trait
  (
    ;; Last token ID, limited to uint range
    (get-last-token-id () (response uint uint))

    ;; URI for metadata associated with the token
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))

    ;; Owner of a given token identifier
    (get-owner (uint) (response (optional principal) uint))

    ;; Transfer from the sender to a new principal
    (transfer (uint principal principal) (response bool uint))
  )
)

;; Error constants
(define-constant ERR_NOT_TOKEN_OWNER (err u1))
(define-constant ERR_TOKEN_NOT_FOUND (err u2))
(define-constant ERR_SENDER_RECIPIENT_EQUAL (err u3))

;; Token name and symbol
(define-constant TOKEN_NAME "Test NFT")
(define-constant TOKEN_SYMBOL "TNFT")

;; Storage for NFT data
(define-non-fungible-token test-nft uint)

;; Token ID counter
(define-data-var last-token-id uint u0)

;; Token URIs (optional)
(define-map token-uris uint (string-ascii 256))

;; SIP009 Functions Implementation

;; Get the last token ID
(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

;; Get token URI
(define-read-only (get-token-uri (token-id uint))
  (ok (map-get? token-uris token-id))
)

;; Get owner of token
(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? test-nft token-id))
)

;; Transfer token
(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    ;; Check if sender is the current owner
    (asserts! (is-eq sender (unwrap! (nft-get-owner? test-nft token-id) ERR_TOKEN_NOT_FOUND)) ERR_NOT_TOKEN_OWNER)
    ;; Check sender and recipient are different
    (asserts! (not (is-eq sender recipient)) ERR_SENDER_RECIPIENT_EQUAL)
    ;; Check if tx-sender is authorized (either owner or the token owner)
    (asserts! (or (is-eq tx-sender sender) (is-eq tx-sender (unwrap! (nft-get-owner? test-nft token-id) ERR_TOKEN_NOT_FOUND))) ERR_NOT_TOKEN_OWNER)
    ;; Transfer the token
    (nft-transfer? test-nft token-id sender recipient)
  )
)

;; Additional utility functions

;; Mint a new token
(define-public (mint (recipient principal))
  (let ((new-token-id (+ (var-get last-token-id) u1)))
    (asserts! (is-ok (nft-mint? test-nft new-token-id recipient)) (err u4))
    (var-set last-token-id new-token-id)
    (ok new-token-id)
  )
)

;; Set token URI (only owner can set)
(define-public (set-token-uri (token-id uint) (uri (string-ascii 256)))
  (let ((owner (unwrap! (nft-get-owner? test-nft token-id) ERR_TOKEN_NOT_FOUND)))
    (asserts! (is-eq tx-sender owner) ERR_NOT_TOKEN_OWNER)
    (map-set token-uris token-id uri)
    (ok true)
  )
)

;; Get token name
(define-read-only (get-token-name)
  (ok TOKEN_NAME)
)

;; Get token symbol  
(define-read-only (get-token-symbol)
  (ok TOKEN_SYMBOL)
)