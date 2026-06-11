// WhatsApp shared types

export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  body?: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  direction: 'inbound' | 'outbound';
  contactName?: string;
  contactPhone?: string;
  templateId?: string;
}

export interface WhatsAppThread {
  id: string;
  phone: string;
  name: string;
  lastMessage?: WhatsAppMessage;
  unreadCount: number;
  timestamp?: string;
}

export interface WhatsAppContact {
  id: string;
  name: string;
  phone: string;
  lastMessage?: WhatsAppMessage;
  unreadCount: number;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  status: 'approved' | 'pending' | 'rejected';
}
