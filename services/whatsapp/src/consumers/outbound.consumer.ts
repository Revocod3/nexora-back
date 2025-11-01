import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { startConsumer, BusMessage } from '@nexora/bus';
import { WhatsappService } from '../services/whatsapp.service.js';
import { createLogger } from '@nexora/logger';
import { logJidTransformation } from '../utils/jid-debug.js';

interface AgentReply {
  channel?: string;
  to?: string;
  body?: string;
  tenantId?: string;
  sessionId?: string;
}

@Injectable()
export class OutboundConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly log = createLogger({ service: 'connector-whatsapp-outbound-consumer' });
  private repliesConsumer?: { stop(): void };

  constructor(private readonly wa: WhatsappService) { }

  onModuleInit() {
    this.repliesConsumer = startConsumer({
      topic: 'agent.replies',
      group: 'connector-whatsapp',
      handler: async (msg: BusMessage<unknown>) => {
        const payload = msg.payload as AgentReply;

        // Only handle WhatsApp messages
        if (payload?.channel !== 'whatsapp') return;
        if (!payload.body || !payload.to) return;

        // Always preserve the original JID format (including @lid) for outbound replies
        // This ensures the reply goes to the correct chat/thread
        const originalTo = (payload.to || '').trim();
        let toJidOrDigits = originalTo;
        
        if (toJidOrDigits.includes('@')) {
          // Use the JID exactly as provided (no normalization)
          logJidTransformation(
            payload.tenantId || payload.sessionId || 'default',
            'outbound_consumer',
            originalTo,
            toJidOrDigits,
            'explicit_jid_preserved',
            { source: 'agent_reply' }
          );
        } else {
          const digits = toJidOrDigits.replace(/[^0-9]/g, '');
          if (digits.length < 6) return;
          toJidOrDigits = digits + '@s.whatsapp.net';
          logJidTransformation(
            payload.tenantId || payload.sessionId || 'default',
            'outbound_consumer',
            originalTo,
            toJidOrDigits,
            'digits_normalized_to_standard',
            { source: 'agent_reply', cleanedDigits: digits }
          );
        }

        // Determine tenant ID
        const tenantId = payload.tenantId || payload.sessionId || 'default';

        try {
          // Check if we have an active session for this tenant
          if (!this.wa.hasSession(tenantId)) {
            this.log.warn('outbound_consumer.no_session', {
              tenantId,
              to: toJidOrDigits,
            });

            // Try to claim the session
            const claimed = await this.wa.claimSession(tenantId);
            if (!claimed) {
              this.log.error('outbound_consumer.session_claim_failed', {
                tenantId,
                to: toJidOrDigits,
              });
              return;
            }

            // Wait a bit for the session to initialize
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          // Send the message
          const result = await this.wa.sendTextToTenant(tenantId, toJidOrDigits, payload.body);

          this.log.info('outbound_consumer.message_sent', {
            tenantId,
            to: toJidOrDigits,
            result,
          });
        } catch (error) {
          this.log.error('outbound_consumer.send_failed', {
            tenantId,
            to: toJidOrDigits,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    });
  }

  onModuleDestroy() {
    try {
      this.repliesConsumer?.stop();
    } catch (error) {
      this.log.error('outbound_consumer.stop_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
