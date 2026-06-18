export interface Article {
  id: string;
  title: string;
  originalTitle: string;
  url: string;
  source: string;
  scrapedAt: string;
  content: string;
  summary: string;
  category: string;
  status: 'scraped' | 'approved' | 'publishing' | 'published' | 'failed';
  wordpressId: string | null;
  publishedAt: string | null;
  whatsappSent: boolean;
  whatsappError: string | null;
  publishError: string | null;
  featuredImage?: string | null;
  isEnriched?: boolean;
}

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  type: string;
  feedUrl: string;
  enabled: boolean;
  lastScrapedAt?: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  section: 'scraper' | 'summarizer' | 'publisher' | 'whatsapp' | 'system';
}

export interface SystemConfig {
  wordpressUrl: string;
  wordpressUsername: string;
  wordpressPassword: string;
  wordpressMode: 'xmlrpc' | 'rest';
  whatsappRecipient: string;
  whatsappGateway: 'twilio' | 'custom_webhook' | 'mock' | 'whatsapp-web';
  whatsappSenderNumber: string;
  whatsappAccountSid: string;
  whatsappApiKey: string;
  schedulerIntervalMins: number;
  schedulerEnabled: boolean;
  apiKeyOverride: string;
}
