export interface WebhookConfig {
  verifyToken: string;
  appUrl?: string;
}

export interface WebhookLog {
  id: string;
  timestamp: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
  status: 'verified' | 'failed' | 'received';
  message?: string;
}
