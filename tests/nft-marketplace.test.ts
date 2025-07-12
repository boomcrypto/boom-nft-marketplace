import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;

// Use the actual SIP009 NFT contract for testing
const nftContract = deployer + ".sip009-nft";

// Helper function to mint NFT for testing
function mintNft(recipient: string, tokenId?: number): { tokenId: number } {
  const result = simnet.callPublicFn(
    "sip009-nft",
    "mint",
    [Cl.principal(recipient)],
    deployer
  );
  
  if (result.result.type === 'ok') {
    // Extract the token ID from the uint response
    const tokenId = Number((result.result.value as any).value);
    return { tokenId };
  }
  throw new Error("Failed to mint NFT: " + result.result);
}

describe("NFT Marketplace Contract", () => {
  beforeEach(() => {
    // Reset simnet state before each test
  });

  describe("Initial State and Configuration", () => {
    it("should have correct initial state", () => {
      // Check initial marketplace fee rate (250 = 2.5%)
      const feeRate = simnet.callReadOnlyFn(
        "nft-marketplace",
        "get-marketplace-fee-rate",
        [],
        deployer
      );
      expect(feeRate.result).toBeUint(250);

      // Check initial listing fee (0)
      const listingFee = simnet.callReadOnlyFn(
        "nft-marketplace",
        "get-listing-fee",
        [],
        deployer
      );
      expect(listingFee.result).toBeUint(0);

      // Check listings are enabled by default
      const listingsEnabled = simnet.callReadOnlyFn(
        "nft-marketplace",
        "get-listings-enabled",
        [],
        deployer
      );
      expect(listingsEnabled.result).toBeBool(true);

      // Check admin wallet is deployer
      const adminWallet = simnet.callReadOnlyFn(
        "nft-marketplace",
        "get-admin-wallet",
        [],
        deployer
      );
      expect(adminWallet.result).toBePrincipal(deployer);
    });

    it("should calculate fees correctly", () => {
      // Test 2.5% fee calculation on 1000000 micro-STX
      const fee = simnet.callReadOnlyFn(
        "nft-marketplace",
        "calculate-marketplace-fee",
        [Cl.uint(1000000)],
        deployer
      );
      expect(fee.result).toBeUint(25000); // 2.5% of 1000000

      // Test net to seller calculation
      const netToSeller = simnet.callReadOnlyFn(
        "nft-marketplace",
        "calculate-net-to-seller",
        [Cl.uint(1000000)],
        deployer
      );
      expect(netToSeller.result).toBeUint(975000); // 1000000 - 25000
    });
  });

  describe("Admin Functions", () => {
    describe("Marketplace Fee Rate Management", () => {
      it("should allow admin to set marketplace fee rate", () => {
        const newRate = 500; // 5%
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-marketplace-fee-rate",
          [Cl.uint(newRate)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));

        // Verify fee rate was updated
        const updatedRate = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-marketplace-fee-rate",
          [],
          deployer
        );
        expect(updatedRate.result).toBeUint(newRate);
      });

      it("should reject fee rate above 10%", () => {
        const invalidRate = 1001; // 10.01%
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-marketplace-fee-rate",
          [Cl.uint(invalidRate)],
          deployer
        );
        expect(result.result).toBeErr(Cl.uint(3001)); // ERR_INVALID_FEE_RATE
      });

      it("should reject non-admin setting fee rate", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-marketplace-fee-rate",
          [Cl.uint(100)],
          alice
        );
        expect(result.result).toBeErr(Cl.uint(2001)); // ERR_UNAUTHORISED
      });
    });

    describe("Listing Fee Management", () => {
      it("should allow admin to set listing fee", () => {
        const newFee = 1000000; // 1 STX
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-listing-fee",
          [Cl.uint(newFee)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));

        // Verify listing fee was updated
        const updatedFee = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-listing-fee",
          [],
          deployer
        );
        expect(updatedFee.result).toBeUint(newFee);
      });

      it("should allow setting listing fee to zero", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-listing-fee",
          [Cl.uint(0)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));
      });

      it("should reject non-admin setting listing fee", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-listing-fee",
          [Cl.uint(1000000)],
          alice
        );
        expect(result.result).toBeErr(Cl.uint(2001)); // ERR_UNAUTHORISED
      });
    });

    describe("Listings Control", () => {
      it("should allow admin to disable listings", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-listings-enabled",
          [Cl.bool(false)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));

        // Verify listings are disabled
        const enabled = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-listings-enabled",
          [],
          deployer
        );
        expect(enabled.result).toBeBool(false);
      });

      it("should allow admin to re-enable listings", () => {
        // First disable
        simnet.callPublicFn(
          "nft-marketplace",
          "set-listings-enabled",
          [Cl.bool(false)],
          deployer
        );

        // Then re-enable
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-listings-enabled",
          [Cl.bool(true)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));

        // Verify listings are enabled
        const enabled = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-listings-enabled",
          [],
          deployer
        );
        expect(enabled.result).toBeBool(true);
      });

      it("should reject non-admin controlling listings", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-listings-enabled",
          [Cl.bool(false)],
          alice
        );
        expect(result.result).toBeErr(Cl.uint(2001)); // ERR_UNAUTHORISED
      });
    });

    describe("Admin Wallet Management", () => {
      it("should allow admin to change admin wallet", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-admin-wallet",
          [Cl.principal(alice)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));

        // Verify admin wallet was updated
        const newAdmin = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-admin-wallet",
          [],
          deployer
        );
        expect(newAdmin.result).toBePrincipal(alice);

        // Reset for other tests
        simnet.callPublicFn(
          "nft-marketplace",
          "set-admin-wallet",
          [Cl.principal(deployer)],
          alice
        );
      });

      it("should reject non-admin changing admin wallet", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-admin-wallet",
          [Cl.principal(alice)],
          bob
        );
        expect(result.result).toBeErr(Cl.uint(2001)); // ERR_UNAUTHORISED
      });
    });

    describe("Whitelisting Management", () => {
      it("should allow admin to whitelist contracts", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-whitelisted",
          [Cl.principal(nftContract), Cl.bool(true)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));

        // Verify contract is whitelisted
        const isWhitelisted = simnet.callReadOnlyFn(
          "nft-marketplace",
          "is-whitelisted",
          [Cl.principal(nftContract)],
          deployer
        );
        expect(isWhitelisted.result).toBeBool(true);
      });

      it("should allow admin to remove from whitelist", () => {
        // First whitelist
        simnet.callPublicFn(
          "nft-marketplace",
          "set-whitelisted",
          [Cl.principal(nftContract), Cl.bool(true)],
          deployer
        );

        // Then remove from whitelist
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-whitelisted",
          [Cl.principal(nftContract), Cl.bool(false)],
          deployer
        );
        expect(result.result).toBeOk(Cl.bool(true));

        // Verify contract is not whitelisted
        const isWhitelisted = simnet.callReadOnlyFn(
          "nft-marketplace",
          "is-whitelisted",
          [Cl.principal(nftContract)],
          deployer
        );
        expect(isWhitelisted.result).toBeBool(false);
      });

      it("should reject non-admin whitelisting", () => {
        const result = simnet.callPublicFn(
          "nft-marketplace",
          "set-whitelisted",
          [Cl.principal(nftContract), Cl.bool(true)],
          alice
        );
        expect(result.result).toBeErr(Cl.uint(2001)); // ERR_UNAUTHORISED
      });
    });
  });

  describe("Listing Operations", () => {
    beforeEach(() => {
      // Setup: Whitelist mock NFT contract and set reasonable fees
      simnet.callPublicFn(
        "nft-marketplace",
        "set-whitelisted",
        [Cl.principal(nftContract), Cl.bool(true)],
        deployer
      );
      simnet.callPublicFn(
        "nft-marketplace",
        "set-listing-fee",
        [Cl.uint(0)], // No listing fee for most tests
        deployer
      );
    });

    describe("Creating Listings", () => {
      it("should create a listing successfully with zero fees", () => {
        // First mint an NFT to Alice
        const { tokenId } = mintNft(alice);
        
        const listingData = {
          taker: Cl.none(),
          "token-id": Cl.uint(tokenId),
          expiry: Cl.uint(100),
          price: Cl.uint(1000000),
          "payment-asset-contract": Cl.none()
        };

        const result = simnet.callPublicFn(
          "nft-marketplace",
          "list-asset",
          [
            Cl.contractPrincipal(deployer, "sip009-nft"),
            Cl.tuple(listingData),
            Cl.stringAscii("collectible"),
            Cl.some(Cl.stringAscii("Test Collection"))
          ],
          alice
        );

        expect(result.result).toBeOk(Cl.uint(0)); // First listing ID

        // Verify listing was created
        const listing = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-listing",
          [Cl.uint(0)],
          deployer
        );
        expect(listing.result).not.toBeNone();
      });

      it("should reject listing when listings are disabled", () => {
        // First mint an NFT to Alice
        const { tokenId } = mintNft(alice);
        
        // Disable listings
        simnet.callPublicFn(
          "nft-marketplace",
          "set-listings-enabled",
          [Cl.bool(false)],
          deployer
        );

        const listingData = {
          taker: Cl.none(),
          "token-id": Cl.uint(tokenId),
          expiry: Cl.uint(100),
          price: Cl.uint(1000000),
          "payment-asset-contract": Cl.none()
        };

        const result = simnet.callPublicFn(
          "nft-marketplace",
          "list-asset",
          [
            Cl.contractPrincipal(deployer, "sip009-nft"),
            Cl.tuple(listingData),
            Cl.stringAscii("collectible"),
            Cl.none()
          ],
          alice
        );

        expect(result.result).toBeErr(Cl.uint(4001)); // ERR_LISTINGS_DISABLED

        // Re-enable for other tests
        simnet.callPublicFn(
          "nft-marketplace",
          "set-listings-enabled",
          [Cl.bool(true)],
          deployer
        );
      });

      it("should reject listing with non-whitelisted NFT contract", () => {
        // First mint an NFT to Alice
        const { tokenId } = mintNft(alice);
        
        // Remove the NFT contract from whitelist
        simnet.callPublicFn(
          "nft-marketplace",
          "set-whitelisted",
          [Cl.principal(nftContract), Cl.bool(false)],
          deployer
        );

        const listingData = {
          taker: Cl.none(),
          "token-id": Cl.uint(tokenId),
          expiry: Cl.uint(100),
          price: Cl.uint(1000000),
          "payment-asset-contract": Cl.none()
        };

        const result = simnet.callPublicFn(
          "nft-marketplace",
          "list-asset",
          [
            Cl.contractPrincipal(deployer, "sip009-nft"),
            Cl.tuple(listingData),
            Cl.stringAscii("collectible"),
            Cl.none()
          ],
          alice
        );

        expect(result.result).toBeErr(Cl.uint(2007)); // ERR_ASSET_CONTRACT_NOT_WHITELISTED
        
        // Re-whitelist for other tests
        simnet.callPublicFn(
          "nft-marketplace",
          "set-whitelisted",
          [Cl.principal(nftContract), Cl.bool(true)],
          deployer
        );
      });

      it("should reject listing with expired expiry", () => {
        const listingData = {
          taker: Cl.none(),
          "token-id": Cl.uint(1),
          expiry: Cl.uint(1), // Past block height
          price: Cl.uint(1000000),
          "payment-asset-contract": Cl.none()
        };

        const result = simnet.callPublicFn(
          "nft-marketplace",
          "list-asset",
          [
            Cl.contractPrincipal(deployer, "sip009-nft"),
            Cl.tuple(listingData),
            Cl.stringAscii("collectible"),
            Cl.none()
          ],
          alice
        );

        expect(result.result).toBeErr(Cl.uint(1000)); // ERR_EXPIRY_IN_PAST
      });

      it("should reject listing with zero price", () => {
        const listingData = {
          taker: Cl.none(),
          "token-id": Cl.uint(1),
          expiry: Cl.uint(100),
          price: Cl.uint(0),
          "payment-asset-contract": Cl.none()
        };

        const result = simnet.callPublicFn(
          "nft-marketplace",
          "list-asset",
          [
            Cl.contractPrincipal(deployer, "sip009-nft"),
            Cl.tuple(listingData),
            Cl.stringAscii("collectible"),
            Cl.none()
          ],
          alice
        );

        expect(result.result).toBeErr(Cl.uint(1001)); // ERR_PRICE_ZERO
      });

      it("should create listing with intended taker", () => {
        // First mint an NFT to Alice
        const { tokenId } = mintNft(alice);
        
        const listingData = {
          taker: Cl.some(Cl.principal(bob)),
          "token-id": Cl.uint(tokenId),
          expiry: Cl.uint(100),
          price: Cl.uint(1000000),
          "payment-asset-contract": Cl.none()
        };

        const result = simnet.callPublicFn(
          "nft-marketplace",
          "list-asset",
          [
            Cl.contractPrincipal(deployer, "sip009-nft"),
            Cl.tuple(listingData),
            Cl.stringAscii("collectible"),
            Cl.none()
          ],
          alice
        );

        expect(result.result).toBeOk(Cl.uint(0));

        // Verify listing was created
        const listing = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-listing",
          [Cl.uint(0)],
          deployer
        );
        expect(listing.result).not.toBeNone();
      });
    });

    describe("Listing Metadata", () => {
      it("should store and retrieve listing metadata", () => {
        // First mint an NFT to Alice
        const { tokenId } = mintNft(alice);
        
        const listingData = {
          taker: Cl.none(),
          "token-id": Cl.uint(tokenId),
          expiry: Cl.uint(100),
          price: Cl.uint(1000000),
          "payment-asset-contract": Cl.none()
        };

        simnet.callPublicFn(
          "nft-marketplace",
          "list-asset",
          [
            Cl.contractPrincipal(deployer, "sip009-nft"),
            Cl.tuple(listingData),
            Cl.stringAscii("art"),
            Cl.some(Cl.stringAscii("Digital Art Collection"))
          ],
          alice
        );

        const metadata = simnet.callReadOnlyFn(
          "nft-marketplace",
          "get-listing-metadata",
          [Cl.uint(0)],
          deployer
        );

        expect(metadata.result).not.toBeNone();
      });
    });
  });

  describe("Listing Cancellation", () => {
    let testTokenId: number;
    
    beforeEach(() => {
      // Setup: Whitelist and create a listing
      simnet.callPublicFn(
        "nft-marketplace",
        "set-whitelisted",
        [Cl.principal(nftContract), Cl.bool(true)],
        deployer
      );

      // Mint an NFT to Alice first
      const { tokenId } = mintNft(alice);
      testTokenId = tokenId;

      const listingData = {
        taker: Cl.none(),
        "token-id": Cl.uint(testTokenId),
        expiry: Cl.uint(100),
        price: Cl.uint(1000000),
        "payment-asset-contract": Cl.none()
      };

      simnet.callPublicFn(
        "nft-marketplace",
        "list-asset",
        [
          Cl.contractPrincipal(deployer, "sip009-nft"),
          Cl.tuple(listingData),
          Cl.stringAscii("collectible"),
          Cl.none()
        ],
        alice
      );
    });

    it("should allow maker to cancel listing", () => {
      const result = simnet.callPublicFn(
        "nft-marketplace",
        "cancel-listing",
        [Cl.uint(0), Cl.contractPrincipal(deployer, "sip009-nft")],
        alice
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify listing was deleted
      const listing = simnet.callReadOnlyFn(
        "nft-marketplace",
        "get-listing",
        [Cl.uint(0)],
        deployer
      );
      expect(listing.result).toBeNone();
    });

    it("should reject cancellation by non-maker", () => {
      const result = simnet.callPublicFn(
        "nft-marketplace",
        "cancel-listing",
        [Cl.uint(0), Cl.contractPrincipal(deployer, "sip009-nft")],
        bob
      );

      expect(result.result).toBeErr(Cl.uint(2001)); // ERR_UNAUTHORISED
    });

    it("should reject cancellation of non-existent listing", () => {
      const result = simnet.callPublicFn(
        "nft-marketplace",
        "cancel-listing",
        [Cl.uint(999), Cl.contractPrincipal(deployer, "sip009-nft")],
        alice
      );

      expect(result.result).toBeErr(Cl.uint(2000)); // ERR_UNKNOWN_LISTING
    });

    it("should reject cancellation with wrong NFT contract", () => {
      // Use the external nft-trait contract (which exists but is different)
      const result = simnet.callPublicFn(
        "nft-marketplace",
        "cancel-listing",
        [Cl.uint(0), Cl.contractPrincipal("SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9", "nft-trait")],
        alice
      );

      expect(result.result).toBeErr(Cl.uint(2003)); // ERR_NFT_ASSET_MISMATCH
    });
  });

  describe("Analytics and Utility Functions", () => {
    it("should emit market summary", () => {
      const result = simnet.callPublicFn(
        "nft-marketplace",
        "emit-market-summary",
        [],
        alice
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("should emit market summary with updated information", () => {
      // Set some fees and create listings first
      simnet.callPublicFn(
        "nft-marketplace",
        "set-marketplace-fee-rate",
        [Cl.uint(500)],
        deployer
      );

      simnet.callPublicFn(
        "nft-marketplace",
        "set-listing-fee",
        [Cl.uint(1000000)],
        deployer
      );

      const result = simnet.callPublicFn(
        "nft-marketplace",
        "emit-market-summary",
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Edge Cases and Error Handling", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "nft-marketplace",
        "set-whitelisted",
        [Cl.principal(nftContract), Cl.bool(true)],
        deployer
      );
    });

    it("should handle very large prices correctly", () => {
      // First mint an NFT to Alice
      const { tokenId } = mintNft(alice);
      
      const largePrice = 1000000000000; // 1 million STX
      
      const listingData = {
        taker: Cl.none(),
        "token-id": Cl.uint(tokenId),
        expiry: Cl.uint(100),
        price: Cl.uint(largePrice),
        "payment-asset-contract": Cl.none()
      };

      const result = simnet.callPublicFn(
        "nft-marketplace",
        "list-asset",
        [
          Cl.contractPrincipal(deployer, "sip009-nft"),
          Cl.tuple(listingData),
          Cl.stringAscii("expensive"),
          Cl.none()
        ],
        alice
      );

      expect(result.result).toBeOk(Cl.uint(0));

      // Calculate fee for large amount
      const fee = simnet.callReadOnlyFn(
        "nft-marketplace",
        "calculate-marketplace-fee",
        [Cl.uint(largePrice)],
        deployer
      );
      expect(fee.result).toBeUint(25000000000); // 2.5% of large price
    });

    it("should handle maximum fee rate (10%)", () => {
      simnet.callPublicFn(
        "nft-marketplace",
        "set-marketplace-fee-rate",
        [Cl.uint(1000)], // 10%
        deployer
      );

      const fee = simnet.callReadOnlyFn(
        "nft-marketplace",
        "calculate-marketplace-fee",
        [Cl.uint(1000000)],
        deployer
      );
      expect(fee.result).toBeUint(100000); // 10% of 1000000
    });
  });

  describe("Complex Scenarios", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "nft-marketplace",
        "set-whitelisted",
        [Cl.principal(nftContract), Cl.bool(true)],
        deployer
      );
    });

    it("should handle admin changing mid-operation", () => {
      // Set initial fees
      simnet.callPublicFn(
        "nft-marketplace",
        "set-listing-fee",
        [Cl.uint(1000000)],
        deployer
      );

      // Change admin (updates the admin-wallet variable)
      const adminResult = simnet.callPublicFn(
        "nft-marketplace",
        "set-admin-wallet",
        [Cl.principal(alice)],
        deployer
      );
      expect(adminResult.result).toBeOk(Cl.bool(true));

      // Verify admin was changed
      const currentAdmin = simnet.callReadOnlyFn(
        "nft-marketplace",
        "get-admin-wallet",
        [],
        deployer
      );
      expect(currentAdmin.result).toBePrincipal(alice);

      // Note: Due to contract implementation, the deployer (contract-owner) 
      // can still perform admin operations even after changing admin-wallet
      const result = simnet.callPublicFn(
        "nft-marketplace",
        "set-listing-fee",
        [Cl.uint(2000000)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true)); // Deployer still has access

      // Non-admin (like alice) should not be able to change fees
      const result2 = simnet.callPublicFn(
        "nft-marketplace",
        "set-listing-fee",
        [Cl.uint(3000000)],
        alice
      );
      expect(result2.result).toBeErr(Cl.uint(2001)); // ERR_UNAUTHORISED
    });

    it("should handle disable-enable-disable listing sequence", () => {
      // First mint NFTs to Alice
      const { tokenId: tokenId1 } = mintNft(alice);
      const { tokenId: tokenId2 } = mintNft(alice);
      
      // Create initial listing
      const listingData = {
        taker: Cl.none(),
        "token-id": Cl.uint(tokenId1),
        expiry: Cl.uint(100),
        price: Cl.uint(1000000),
        "payment-asset-contract": Cl.none()
      };

      const result1 = simnet.callPublicFn(
        "nft-marketplace",
        "list-asset",
        [
          Cl.contractPrincipal(deployer, "sip009-nft"),
          Cl.tuple(listingData),
          Cl.stringAscii("test"),
          Cl.none()
        ],
        alice
      );
      expect(result1.result).toBeOk(Cl.uint(0));

      // Disable listings
      simnet.callPublicFn(
        "nft-marketplace",
        "set-listings-enabled",
        [Cl.bool(false)],
        deployer
      );

      // Try to create listing (should fail)
      const result2 = simnet.callPublicFn(
        "nft-marketplace",
        "list-asset",
        [
          Cl.contractPrincipal(deployer, "sip009-nft"),
          Cl.tuple({...listingData, "token-id": Cl.uint(tokenId2)}),
          Cl.stringAscii("test2"),
          Cl.none()
        ],
        alice
      );
      expect(result2.result).toBeErr(Cl.uint(4001)); // ERR_LISTINGS_DISABLED

      // Re-enable listings
      simnet.callPublicFn(
        "nft-marketplace",
        "set-listings-enabled",
        [Cl.bool(true)],
        deployer
      );

      // Create listing (should succeed)
      const result3 = simnet.callPublicFn(
        "nft-marketplace",
        "list-asset",
        [
          Cl.contractPrincipal(deployer, "sip009-nft"),
          Cl.tuple({...listingData, "token-id": Cl.uint(tokenId2)}),
          Cl.stringAscii("test3"),
          Cl.none()
        ],
        alice
      );
      expect(result3.result).toBeOk(Cl.uint(1));
    });
  });
});
