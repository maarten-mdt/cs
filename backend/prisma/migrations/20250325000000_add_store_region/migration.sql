-- AlterTable: add storeRegion to Conversation
ALTER TABLE "Conversation" ADD COLUMN "storeRegion" TEXT NOT NULL DEFAULT 'CA';

-- AlterTable: add storeRegion to Customer, drop unique on shopifyId
ALTER TABLE "Customer" ADD COLUMN "storeRegion" TEXT NOT NULL DEFAULT 'CA';

-- Drop the unique constraint on shopifyId (allows same Shopify customer across stores)
DROP INDEX IF EXISTS "Customer_shopifyId_key";
