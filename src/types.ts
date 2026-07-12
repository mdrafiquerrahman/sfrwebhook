export interface WebhookConfig {
  verifyToken: string;
  appUrl?: string;
  pageAccessToken?: string;
  autoReplyText?: string;
  replyDelaySeconds?: number;
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
