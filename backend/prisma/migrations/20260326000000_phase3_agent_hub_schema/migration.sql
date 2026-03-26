-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('CHAT', 'EMAIL', 'PHONE', 'API');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('COMPLETED', 'MISSED', 'VOICEMAIL', 'NO_ANSWER');

-- CreateEnum
CREATE TYPE "CallSource" AS ENUM ('MANUAL', 'RINGCENTRAL', 'AIRCALL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConversationStatus" ADD VALUE 'OPEN';
ALTER TYPE "ConversationStatus" ADD VALUE 'PENDING';
ALTER TYPE "ConversationStatus" ADD VALUE 'SNOOZED';

-- AlterEnum
ALTER TYPE "MessageRole" ADD VALUE 'AGENT';

-- Drop legacy lowercase table foreign keys (safe — IF EXISTS)
ALTER TABLE IF EXISTS "knowledge_chunks" DROP CONSTRAINT IF EXISTS "knowledge_chunks_source_id_fkey";
ALTER TABLE IF EXISTS "messages" DROP CONSTRAINT IF EXISTS "messages_conversation_id_fkey";

-- Drop old indexes if they exist
DROP INDEX IF EXISTS "Customer_mergedIntoId_idx";
DROP INDEX IF EXISTS "KnowledgeChunk_sourceId_idx";
DROP INDEX IF EXISTS "Message_conversationId_idx";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "channel" "Channel" NOT NULL DEFAULT 'CHAT',
ADD COLUMN     "emailThreadId" TEXT,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "subject" TEXT,
ALTER COLUMN "storeRegion" SET DEFAULT 'US';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "klaviyoProfileId" TEXT,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "storeRegion" SET DEFAULT 'US';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "channel" "Channel",
ADD COLUMN     "isInternal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senderAgentId" TEXT;

-- Drop legacy lowercase tables (not session — used by express-session)
DROP TABLE IF EXISTS "connections";
DROP TABLE IF EXISTS "conversations";
DROP TABLE IF EXISTS "customers";
DROP TABLE IF EXISTS "data_sources";
DROP TABLE IF EXISTS "knowledge_chunks";
DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "widget_config";

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTag" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedResponse" (
    "id" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneCall" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "customerId" TEXT,
    "agentId" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "status" "CallStatus" NOT NULL,
    "phoneFrom" TEXT NOT NULL,
    "phoneTo" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "summary" TEXT NOT NULL,
    "outcome" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "externalCallId" TEXT,
    "recordingUrl" TEXT,
    "transcriptText" TEXT,
    "aiSummary" TEXT,
    "source" "CallSource" NOT NULL DEFAULT 'MANUAL',
    "rawWebhookData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTag_conversationId_tagId_key" ON "ConversationTag"("conversationId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CannedResponse_shortcut_key" ON "CannedResponse"("shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneCall_externalCallId_key" ON "PhoneCall"("externalCallId");

-- CreateIndex
CREATE INDEX "PhoneCall_customerId_startedAt_idx" ON "PhoneCall"("customerId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "PhoneCall_agentId_startedAt_idx" ON "PhoneCall"("agentId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "PhoneCall_externalCallId_idx" ON "PhoneCall"("externalCallId");

-- CreateIndex
CREATE INDEX "Conversation_status_lastMessageAt_idx" ON "Conversation"("status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Conversation_assignedToId_status_idx" ON "Conversation"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Conversation_emailThreadId_idx" ON "Conversation"("emailThreadId");

-- CreateIndex
CREATE INDEX "Conversation_channel_status_createdAt_idx" ON "Conversation"("channel", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Customer_shopifyId_idx" ON "Customer"("shopifyId");

-- CreateIndex
CREATE INDEX "Customer_klaviyoProfileId_idx" ON "Customer"("klaviyoProfileId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

