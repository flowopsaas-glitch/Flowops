-- Add delivery timestamp so recipients can distinguish "sent" from "delivered".
-- Additive, nullable: existing messages keep deliveredAt = NULL (not delivered).
ALTER TABLE "driver_chat_messages" ADD COLUMN "deliveredAt" TIMESTAMP(3);
