export class WhatsAppAccount {
  id: string;

  subscriptionId: string;

  /**
   * Client-owned WhatsApp number
   * Used for secure business communication
   */
  clientPhoneNumber: string;

  verified: boolean;

  createdAt: Date;
}
