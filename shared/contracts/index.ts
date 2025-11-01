// Simplified contracts - basic schemas
import { z } from 'zod';

export const EnvelopeSchema = z.object({
  channel: z.enum(['whatsapp', 'telegram', 'email']),
  from: z.string(),
  to: z.string().optional(),
  body: z.string(),
  tenantId: z.string(),
  conversationId: z.string().optional(),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
