export interface WhatsAppThread {
  phone: string;
  lastMessage?: string;
}

export interface WhatsAppMessage {
  id: number;
  body: string;
  direction: 'inbound' | 'outbound';
  createdAt: string;
}
