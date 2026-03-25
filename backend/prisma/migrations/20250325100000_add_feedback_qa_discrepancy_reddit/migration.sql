-- Add REDDIT to SourceType enum
ALTER TYPE "SourceType" ADD VALUE 'REDDIT';

-- CreateTable: MessageFeedback
CREATE TABLE "MessageFeedback" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageFeedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageFeedback_messageId_key" ON "MessageFeedback"("messageId");
ALTER TABLE "MessageFeedback" ADD CONSTRAINT "MessageFeedback_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: CuratedQA
CREATE TABLE "CuratedQA" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" TEXT,
    "addedBy" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CuratedQA_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Discrepancy
CREATE TABLE "Discrepancy" (
    "id" TEXT NOT NULL,
    "communitySource" TEXT NOT NULL,
    "communityText" TEXT NOT NULL,
    "websiteText" TEXT,
    "websiteUrl" TEXT,
    "topic" TEXT NOT NULL,
    "aiSuggestion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);
