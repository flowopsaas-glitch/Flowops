-- Optional client-generated keys permit safe retries without changing legacy sends.
-- PostgreSQL permits multiple NULLs, so existing messages need no backfill.
ALTER TABLE "driver_chat_messages" ADD COLUMN "clientMessageId" TEXT;
CREATE UNIQUE INDEX "driver_chat_messages_companyId_driverId_clientMessageId_key"
  ON "driver_chat_messages"("companyId", "driverId", "clientMessageId");
