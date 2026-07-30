// src/lib/notifications/types.ts

export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app' | 'whatsapp';

export type EnqueueArgs = {
  requestId?: string | null;
  ownerId: string;
  templateName: string;
  templateVersion?: number | null;
  channel?: NotificationChannel | null;
  payload?: Record<string, unknown>;
  scheduledAt?: string | null; // ISO timestamptz
  priority?: number;
  aggregateType?: string | null;
  aggregateId?: string | null;
};

export type QueueRow = {
  id: string;
  request_id?: string | null;
  owner_id: string;
  template_name: string;
  template_version?: number | null;
  channel?: NotificationChannel | null;
  payload: Record<string, unknown>;
  scheduled_at?: string | null;
  priority: number;
  attempt_count: number;
  next_attempt_at?: string | null;
  status: string;
  created_at: string;
};
