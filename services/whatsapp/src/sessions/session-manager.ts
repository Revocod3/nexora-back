import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantSessionService, TenantSessionServiceImpl } from './tenant-session-service.js';
import { SessionLockManager } from '../locks/session-lock-manager.js';
import { RedisService } from '../auth/redis.service.js';
import { WhatsappConfigService } from '../config/config.js';
import { createLogger } from '../utils/logger.js';

@Injectable()
export class WhatsAppSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly log = createLogger('connector-whatsapp-session-manager');
  private readonly activeSessions = new Map<string, TenantSessionService>();
  private readonly workerId: string;
  private readonly maxSessionsPerWorker: number;
  private readonly sessionClaimInterval: number;
  private claimTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(
    private readonly config: WhatsappConfigService,
    private readonly redisService: RedisService,
    private readonly lockManager: SessionLockManager,
  ) {
    this.workerId = process.env.WA_WORKER_ID || process.env.HOSTNAME || `worker-${process.pid}`;
    this.maxSessionsPerWorker = parseInt(process.env.WA_MAX_SESSIONS_PER_WORKER || '10');
    this.sessionClaimInterval = parseInt(process.env.WA_SESSION_CLAIM_INTERVAL_SEC || '60') * 1000;
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.WA_DISABLE === '1') {
      return;
    }

    this.log.info('session_manager.initializing', {
      workerId: this.workerId,
      maxSessionsPerWorker: this.maxSessionsPerWorker,
      claimInterval: this.sessionClaimInterval / 1000,
    });

    // Start background session claiming
    if (process.env.WA_AUTO_CLAIM !== '0') {
      this.startSessionClaiming();

      // Initial scan for available sessions
      setTimeout(() => this.scanForAvailableSessions(), 1000);
    }
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;

    // Stop session claiming
    if (this.claimTimer) {
      clearInterval(this.claimTimer);
      this.claimTimer = undefined;
    }

    // Disconnect all active sessions
    const disconnectPromises = Array.from(this.activeSessions.entries()).map(
      async ([tenantId, session]) => {
        try {
          await session.disconnect();
          this.log.info('session_manager.session.disconnected', {
            tenantId,
            workerId: this.workerId,
          });
        } catch (error) {
          this.log.error('session_manager.session.disconnect.error', {
            tenantId,
            workerId: this.workerId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    );

    await Promise.allSettled(disconnectPromises);
    this.activeSessions.clear();

    this.log.info('session_manager.shutdown', {
      workerId: this.workerId,
      sessionsDisconnected: disconnectPromises.length,
    });
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Map<string, TenantSessionService> {
    return new Map(this.activeSessions);
  }

  /**
   * Get a specific session by tenant ID
   */
  getSession(tenantId: string): TenantSessionService | null {
    return this.activeSessions.get(tenantId) || null;
  }

  /**
   * Check if a tenant has an active session
   */
  hasSession(tenantId: string): boolean {
    return this.activeSessions.has(tenantId);
  }

  /**
   * Get the number of active sessions
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Send a message using the appropriate tenant session
   */
  async sendMessage(tenantId: string, to: string, message: any): Promise<void> {
    const session = this.activeSessions.get(tenantId);
    if (!session) {
      throw new Error(`No active session for tenant ${tenantId}`);
    }

    if (!session.isConnected()) {
      throw new Error(`Session not connected for tenant ${tenantId}`);
    }

    await session.sendMessage(to, message);
  }

  /**
   * Manually claim a session for a specific tenant
   */
  async claimSession(tenantId: string): Promise<boolean> {
    if (this.isShuttingDown) {
      return false;
    }

    if (this.activeSessions.has(tenantId)) {
      this.log.debug('session_manager.claim.already_active', {
        tenantId,
        workerId: this.workerId,
      });
      return true;
    }

    if (this.activeSessions.size >= this.maxSessionsPerWorker) {
      this.log.warn('session_manager.claim.max_sessions_reached', {
        tenantId,
        workerId: this.workerId,
        activeCount: this.activeSessions.size,
        maxAllowed: this.maxSessionsPerWorker,
      });
      return false;
    }

    try {
      const session = new TenantSessionServiceImpl(
        tenantId,
        this.config,
        this.redisService,
        this.lockManager,
        this.workerId,
      );

      const initialized = await session.initialize();
      if (initialized) {
        this.activeSessions.set(tenantId, session);
        this.log.info('session_manager.session.claimed', {
          tenantId,
          workerId: this.workerId,
          activeCount: this.activeSessions.size,
        });
        return true;
      } else {
        this.log.info('session_manager.session.claim_failed', {
          tenantId,
          workerId: this.workerId,
        });
        return false;
      }
    } catch (error) {
      this.log.error('session_manager.session.claim.error', {
        tenantId,
        workerId: this.workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Release a session for a specific tenant
   */
  async releaseSession(tenantId: string): Promise<void> {
    const session = this.activeSessions.get(tenantId);
    if (!session) {
      return;
    }

    try {
      await session.disconnect();
      this.activeSessions.delete(tenantId);
      this.log.info('session_manager.session.released', {
        tenantId,
        workerId: this.workerId,
        remainingCount: this.activeSessions.size,
      });
    } catch (error) {
      this.log.error('session_manager.session.release.error', {
        tenantId,
        workerId: this.workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Still remove from map even if disconnect failed
      this.activeSessions.delete(tenantId);
    }
  }

  /**
   * Clear auth state for a tenant (used for logout scenarios)
   */
  async clearAuthStateForTenant(tenantId: string): Promise<void> {
    try {
      const { useRedisAuthState } = await import('../auth/redis-auth-state.js');

      // Create a temporary auth state instance just to clear it
      const { clearAuthState } = await useRedisAuthState(tenantId, this.redisService);
      await clearAuthState();

      this.log.info('session_manager.auth_state.cleared', {
        tenantId,
        workerId: this.workerId
      });
    } catch (error) {
      this.log.error('session_manager.auth_state.clear.error', {
        tenantId,
        workerId: this.workerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Scan for available sessions that can be claimed
   */
  async scanForAvailableSessions(): Promise<string[]> {
    if (this.isShuttingDown) {
      return [];
    }

    try {
      // Get all locks to see which tenants have sessions
      const allLocks = await this.lockManager.getAllLocks();
      const availableTenants: string[] = [];

      // First, check for expired locks that can be claimed
      for (const [tenantId, lockInfo] of Object.entries(allLocks)) {
        // Skip if we already have this session
        if (this.activeSessions.has(tenantId)) {
          continue;
        }

        // Skip if we're at max capacity
        if (this.activeSessions.size >= this.maxSessionsPerWorker) {
          break;
        }

        // Check if lock is expired or can be claimed
        const lockAge = Date.now() - lockInfo.acquiredAt;
        const isExpired = lockAge > lockInfo.ttlSeconds * 1000;

        if (isExpired) {
          availableTenants.push(tenantId);
        } else if (lockInfo.workerId === this.workerId) {
          // Lock is owned by current worker but no active session - claim it
          // This handles container restarts where the lock persists
          availableTenants.push(tenantId);
        }
      }

      // Also check for configured tenants that don't have locks yet
      const configuredTenants = await this.getAvailableTenants();
      for (const tenantId of configuredTenants) {
        // Skip if we already have this session
        if (this.activeSessions.has(tenantId)) {
          continue;
        }

        // Skip if we're at max capacity
        if (this.activeSessions.size >= this.maxSessionsPerWorker) {
          break;
        }

        // Skip if this tenant already has an active (non-expired) lock
        if (allLocks[tenantId]) {
          const lockInfo = allLocks[tenantId];
          const lockAge = Date.now() - lockInfo.acquiredAt;
          const isExpired = lockAge > lockInfo.ttlSeconds * 1000;
          if (!isExpired) {
            continue; // Lock is still active
          }
        }

        // This tenant is configured but doesn't have an active session
        if (!availableTenants.includes(tenantId)) {
          availableTenants.push(tenantId);
        }
      }

      this.log.debug('session_manager.scan.completed', {
        workerId: this.workerId,
        availableTenants: availableTenants.length,
        totalLocks: Object.keys(allLocks).length,
        activeSessions: this.activeSessions.size,
      });

      // Try to claim available sessions
      const claimedTenants: string[] = [];
      for (const tenantId of availableTenants) {
        const claimed = await this.claimSession(tenantId);
        if (claimed) {
          claimedTenants.push(tenantId);
        }
      }

      return claimedTenants;
    } catch (error) {
      this.log.error('session_manager.scan.error', {
        workerId: this.workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get session status for monitoring
   */
  getSessionStatus(): Record<string, any> {
    const sessions: Record<string, any> = {};

    for (const [tenantId, session] of this.activeSessions) {
      sessions[tenantId] = {
        connectionState: session.getConnectionState(),
        isConnected: session.isConnected(),
        lastQr: session.getLastQr() ? '[REDACTED]' : null,
        workerId: this.workerId,
      };
    }

    return {
      workerId: this.workerId,
      activeSessions: sessions,
      sessionCount: this.activeSessions.size,
      maxSessions: this.maxSessionsPerWorker,
      isShuttingDown: this.isShuttingDown,
    };
  }

  /**
   * Start background session claiming process
   */
  private startSessionClaiming(): void {
    this.claimTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.scanForAvailableSessions();
      }
    }, this.sessionClaimInterval);

    this.log.info('session_manager.claim_timer.started', {
      workerId: this.workerId,
      interval: this.sessionClaimInterval / 1000,
    });
  }

  /**
   * Get available tenants from configuration or Redis
   */
  private async getAvailableTenants(): Promise<string[]> {
    const tenantDiscoveryMode = process.env.WA_TENANT_DISCOVERY_MODE || 'env';
    const defaultTenant = process.env.WA_DEFAULT_TENANT_ID || 'default';

    if (tenantDiscoveryMode === 'env') {
      const tenantsEnv = process.env.WA_AVAILABLE_TENANTS;
      if (tenantsEnv) {
        return tenantsEnv.split(',').map((t) => t.trim());
      }
      return [defaultTenant];
    }

    if (tenantDiscoveryMode === 'redis') {
      // TODO: Implement Redis-based tenant discovery
      // For now, return default
      return [defaultTenant];
    }

    // API mode - TODO: Implement API-based tenant discovery
    return [defaultTenant];
  }
}
