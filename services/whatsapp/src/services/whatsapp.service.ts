import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WhatsappConfigService } from '../config/config.js';
import { createLogger } from '../utils/logger.js';
import { WhatsAppSessionManager } from '../sessions/session-manager.js';
import { logJidTransformation } from '../utils/jid-debug.js';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly log = createLogger('connector-whatsapp');
  private readonly defaultTenantId: string;

  constructor(
    private readonly config: WhatsappConfigService,
    private readonly sessionManager: WhatsAppSessionManager,
  ) {
    this.defaultTenantId = process.env.WA_DEFAULT_TENANT_ID || 'default';
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.WA_DISABLE === '1') return;

    this.log.info('whatsapp.service.initializing', {
      defaultTenantId: this.defaultTenantId,
    });

    // For backward compatibility, try to claim the default tenant session
    // Disabled during testing to fix startup issues
    if (process.env.WA_AUTO_CLAIM !== '0') {
      setTimeout(async () => {
        try {
          await this.sessionManager.claimSession(this.defaultTenantId);
        } catch (error) {
          this.log.error('whatsapp.service.default_session_claim.error', {
            tenantId: this.defaultTenantId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }, 2000);
    }
  }

  async onModuleDestroy() {
    this.log.info('whatsapp.service.shutting_down');
    // Session manager will handle cleanup of all sessions
  }

  /**
   * Get connection state for the default tenant (backward compatibility)
   */
  getConnectionState(): string {
    const session = this.sessionManager.getSession(this.defaultTenantId);
    return session ? session.getConnectionState() : 'disconnected';
  }

  /**
   * Get last QR code for the default tenant (backward compatibility)
   */
  getLastQr(): string | null {
    const session = this.sessionManager.getSession(this.defaultTenantId);
    return session ? session.getLastQr() : null;
  }

  /**
   * Send text message for the default tenant (backward compatibility)
   */
  async sendText(jidOrDigits: string, text: string): Promise<any> {
    return this.sendTextToTenant(this.defaultTenantId, jidOrDigits, text);
  }

  /**
   * Send text message to a specific tenant
   */
  async sendTextToTenant(tenantId: string, jidOrDigits: string, text: string): Promise<any> {
    // FIXED: Preserve @lid JIDs and other explicit JID formats for thread consistency
    let target: string;
    if (/@/.test(jidOrDigits)) {
      // Already a JID format - preserve it exactly (including @lid JIDs)
      target = jidOrDigits;
      logJidTransformation(
        tenantId,
        'whatsapp_service',
        jidOrDigits,
        target,
        'explicit_jid_preserved',
        { method: 'sendTextToTenant', textLength: text.length }
      );
    } else {
      // Only digits provided - convert to standard @s.whatsapp.net format
      const cleanedDigits = jidOrDigits.replace(/[^0-9]/g, '');
      target = cleanedDigits + '@s.whatsapp.net';
      logJidTransformation(
        tenantId,
        'whatsapp_service',
        jidOrDigits,
        target,
        'digits_normalized_to_standard',
        { method: 'sendTextToTenant', cleanedDigits, textLength: text.length }
      );
    }

    try {
      await this.sessionManager.sendMessage(tenantId, target, { text });
      return { to: target, len: text.length, tenantId };
    } catch (error) {
      this.log.error('whatsapp.service.send_text.error', {
        tenantId,
        to: target,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Reset auth for the default tenant (backward compatibility)
   */
  async resetAuthDir(): Promise<any> {
    return this.resetAuthForTenant(this.defaultTenantId);
  }

  /**
   * Reset auth for a specific tenant
   */
  async resetAuthForTenant(tenantId: string): Promise<any> {
    try {
      // First release the session
      await this.sessionManager.releaseSession(tenantId);

      // Clear the auth state to force fresh QR generation
      await this.sessionManager.clearAuthStateForTenant(tenantId);

      this.log.info('whatsapp.service.auth_cleared', {
        tenantId,
        message: 'Auth state cleared - fresh QR will be generated on next connection'
      });

      // Wait a bit before trying to reclaim
      setTimeout(async () => {
        try {
          await this.sessionManager.claimSession(tenantId);
        } catch (error) {
          this.log.error('whatsapp.service.reclaim_after_reset.error', {
            tenantId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }, 1000);

      return { ok: true, restarted: true, tenantId, authCleared: true };
    } catch (error) {
      this.log.error('whatsapp.service.reset_auth.error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get session status for all tenants
   */
  getAllSessionStatus(): any {
    return this.sessionManager.getSessionStatus();
  }

  /**
   * Get session status for a specific tenant
   */
  getSessionStatus(tenantId: string): any {
    const session = this.sessionManager.getSession(tenantId);
    if (!session) {
      return {
        tenantId,
        connectionState: 'disconnected',
        isConnected: false,
        exists: false,
      };
    }

    return {
      tenantId,
      connectionState: session.getConnectionState(),
      isConnected: session.isConnected(),
      lastQr: session.getLastQr() ? '[REDACTED]' : null,
      exists: true,
    };
  }

  /**
   * Manually claim a session for a tenant
   */
  async claimSession(tenantId: string): Promise<boolean> {
    return this.sessionManager.claimSession(tenantId);
  }

  /**
   * Manually release a session for a tenant
   */
  async releaseSession(tenantId: string): Promise<void> {
    return this.sessionManager.releaseSession(tenantId);
  }

  /**
   * Check if a tenant has an active session
   */
  hasSession(tenantId: string): boolean {
    return this.sessionManager.hasSession(tenantId);
  }

  /**
   * Get the number of active sessions
   */
  getActiveSessionCount(): number {
    return this.sessionManager.getActiveSessionCount();
  }
}