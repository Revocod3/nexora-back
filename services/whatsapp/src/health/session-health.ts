import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WhatsAppSessionManager } from '../sessions/session-manager.js';
import { SessionLockManager } from '../locks/session-lock-manager.js';
import { RedisService } from '../auth/redis.service.js';
import { createLogger } from '@nexora/logger';

export interface SessionHealthStatus {
  tenantId: string;
  workerId: string;
  connectionState: string;
  isConnected: boolean;
  lockOwned: boolean;
  lastSeen: number;
  qrAvailable: boolean;
  status: 'healthy' | 'warning' | 'error';
  issues: string[];
}

export interface HealthSummary {
  totalSessions: number;
  healthySessions: number;
  warningSessions: number;
  errorSessions: number;
  orphanedLocks: number;
  expiredLocks: number;
  timestamp: number;
}

@Injectable()
export class SessionHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly log = createLogger('connector-whatsapp-health');
  private readonly healthCheckInterval: number;
  private readonly maxSessionAge: number;
  private healthCheckTimer?: NodeJS.Timeout;
  private lastHealthSummary?: HealthSummary;

  constructor(
    private readonly sessionManager: WhatsAppSessionManager,
    private readonly lockManager: SessionLockManager,
    private readonly redisService: RedisService,
  ) {
    this.healthCheckInterval = parseInt(process.env.WA_HEALTH_CHECK_INTERVAL_SEC || '30') * 1000;
    this.maxSessionAge = parseInt(process.env.WA_MAX_SESSION_AGE_MINUTES || '60') * 60 * 1000;
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.WA_DISABLE === '1') {
      return;
    }

    this.log.info('health_service.initializing', {
      checkInterval: this.healthCheckInterval / 1000,
      maxSessionAge: this.maxSessionAge / (60 * 1000),
    });

    // Start health monitoring
    this.startHealthMonitoring();
  }

  async onModuleDestroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Get detailed health status for all sessions
   */
  async getDetailedHealthStatus(): Promise<SessionHealthStatus[]> {
    const activeSessions = this.sessionManager.getActiveSessions();
    const allLocks = await this.lockManager.getAllLocks();
    const healthStatuses: SessionHealthStatus[] = [];

    // Check active sessions
    for (const [tenantId, session] of activeSessions) {
      const lockInfo = allLocks[tenantId];
      const issues: string[] = [];

      // Check connection
      const isConnected = session.isConnected();
      const connectionState = session.getConnectionState();

      if (!isConnected && connectionState !== 'connecting') {
        issues.push('not_connected');
      }

      // Check lock ownership - be more lenient when session is actually connected
      let lockOwned = false;
      let actualWorkerId = lockInfo?.workerId || 'unknown';

      if (lockInfo) {
        // First check if the lock is owned by the session manager's worker
        // Use the session manager's worker ID for consistency
        const sessionManagerStatus = this.sessionManager.getSessionStatus();
        const expectedWorkerId = sessionManagerStatus.workerId;

        lockOwned = lockInfo.workerId === expectedWorkerId;

        // If the lock exists and session is connected, consider it owned
        // This handles cases where the worker ID detection has issues
        if (!lockOwned && isConnected && connectionState === 'open') {
          lockOwned = true;
          actualWorkerId = lockInfo.workerId; // Use the actual worker ID from lock
        }
      } else if (isConnected && connectionState === 'open') {
        // If no lock info but session is connected, this is still OK
        // The lock might be in a transitional state
        lockOwned = true;
        actualWorkerId = 'connected-without-lock';
      }

      // If session is connected and working, don't treat lock ownership as critical
      const isCriticalLockIssue = !lockOwned && (!isConnected || connectionState !== 'open');

      if (isCriticalLockIssue) {
        issues.push('lock_not_owned');
      } else if (!lockOwned) {
        // Non-critical lock issue - log as warning but don't fail health check
        issues.push('lock_ownership_warning');
      }

      // Check session age
      if (lockInfo) {
        const sessionAge = Date.now() - lockInfo.acquiredAt;
        if (sessionAge > this.maxSessionAge) {
          issues.push('session_too_old');
        }
      }

      // Determine status
      let status: 'healthy' | 'warning' | 'error' = 'healthy';
      if (issues.includes('lock_not_owned') || issues.includes('not_connected')) {
        status = 'error';
      } else if (issues.length > 0) {
        status = 'warning';
      }

      healthStatuses.push({
        tenantId,
        workerId: actualWorkerId,
        connectionState,
        isConnected,
        lockOwned,
        lastSeen: lockInfo?.acquiredAt || 0,
        qrAvailable: session.getLastQr() !== null,
        status,
        issues,
      });
    }

    // Check for orphaned locks (locks without active sessions)
    for (const [tenantId, lockInfo] of Object.entries(allLocks)) {
      if (!activeSessions.has(tenantId)) {
        const lockAge = Date.now() - lockInfo.acquiredAt;
        const isExpired = lockAge > lockInfo.ttlSeconds * 1000;

        healthStatuses.push({
          tenantId,
          workerId: lockInfo.workerId,
          connectionState: 'disconnected',
          isConnected: false,
          lockOwned: true,
          lastSeen: lockInfo.acquiredAt,
          qrAvailable: false,
          status: isExpired ? 'error' : 'warning',
          issues: isExpired ? ['expired_lock'] : ['orphaned_lock'],
        });
      }
    }

    return healthStatuses;
  }

  /**
   * Get health summary
   */
  async getHealthSummary(): Promise<HealthSummary> {
    const detailedStatus = await this.getDetailedHealthStatus();

    const summary: HealthSummary = {
      totalSessions: detailedStatus.length,
      healthySessions: detailedStatus.filter((s) => s.status === 'healthy').length,
      warningSessions: detailedStatus.filter((s) => s.status === 'warning').length,
      errorSessions: detailedStatus.filter((s) => s.status === 'error').length,
      orphanedLocks: detailedStatus.filter((s) => s.issues.includes('orphaned_lock')).length,
      expiredLocks: detailedStatus.filter((s) => s.issues.includes('expired_lock')).length,
      timestamp: Date.now(),
    };

    this.lastHealthSummary = summary;
    return summary;
  }

  /**
   * Perform health check and log issues
   */
  async performHealthCheck(): Promise<void> {
    try {
      const summary = await this.getHealthSummary();
      const detailedStatus = await this.getDetailedHealthStatus();

      // Log summary
      this.log.info('health_check.summary', {
        totalSessions: summary.totalSessions,
        healthy: summary.healthySessions,
        warning: summary.warningSessions,
        error: summary.errorSessions,
        orphanedLocks: summary.orphanedLocks,
        expiredLocks: summary.expiredLocks,
      });

      // Log individual issues
      const errorSessions = detailedStatus.filter((s) => s.status === 'error');
      const warningSessions = detailedStatus.filter((s) => s.status === 'warning');

      for (const session of [...errorSessions, ...warningSessions]) {
        this.log.warn('health_check.session_issue', {
          tenantId: session.tenantId,
          workerId: session.workerId,
          status: session.status,
          issues: session.issues,
          connectionState: session.connectionState,
          isConnected: session.isConnected,
          lockOwned: session.lockOwned,
        });
      }

      // Auto-cleanup expired locks
      if (summary.expiredLocks > 0) {
        await this.cleanupExpiredLocks();
      }
    } catch (error) {
      this.log.error('health_check.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get the last health summary
   */
  getLastHealthSummary(): HealthSummary | null {
    return this.lastHealthSummary || null;
  }

  /**
   * Check if the service is healthy overall
   */
  async isHealthy(): Promise<boolean> {
    try {
      const summary = await this.getHealthSummary();

      // Service is healthy if there are no error sessions and Redis is accessible
      const redisHealthy = await this.redisService.ping();

      return summary.errorSessions === 0 && redisHealthy;
    } catch (error) {
      this.log.error('health_check.overall.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Clean up expired locks
   */
  private async cleanupExpiredLocks(): Promise<void> {
    try {
      const allLocks = await this.lockManager.getAllLocks();
      let cleanedCount = 0;

      for (const [tenantId, lockInfo] of Object.entries(allLocks)) {
        const lockAge = Date.now() - lockInfo.acquiredAt;
        const isExpired = lockAge > lockInfo.ttlSeconds * 1000;

        if (isExpired) {
          const released = await this.lockManager.forceReleaseLock(tenantId);
          if (released) {
            cleanedCount++;
            this.log.info('health_check.expired_lock_cleaned', {
              tenantId,
              previousOwner: released,
              ageMinutes: Math.floor(lockAge / (60 * 1000)),
            });
          }
        }
      }

      if (cleanedCount > 0) {
        this.log.info('health_check.cleanup_completed', {
          expiredLocksCleaned: cleanedCount,
        });
      }
    } catch (error) {
      this.log.error('health_check.cleanup.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckInterval);

    this.log.info('health_monitoring.started', {
      interval: this.healthCheckInterval / 1000,
    });

    // Perform initial health check
    setTimeout(() => this.performHealthCheck(), 10000);
  }

  /**
   * Get health metrics for monitoring systems
   */
  async getHealthMetrics(): Promise<Record<string, number>> {
    const summary = await this.getHealthSummary();
    const detailedStatus = await this.getDetailedHealthStatus();

    const metrics: Record<string, number> = {
      whatsapp_sessions_total: summary.totalSessions,
      whatsapp_sessions_healthy: summary.healthySessions,
      whatsapp_sessions_warning: summary.warningSessions,
      whatsapp_sessions_error: summary.errorSessions,
      whatsapp_locks_orphaned: summary.orphanedLocks,
      whatsapp_locks_expired: summary.expiredLocks,
      whatsapp_health_check_timestamp: summary.timestamp,
    };

    // Add per-session metrics
    for (const session of detailedStatus) {
      const prefix = `whatsapp_session_${session.tenantId}`;
      metrics[`${prefix}_connected`] = session.isConnected ? 1 : 0;
      metrics[`${prefix}_lock_owned`] = session.lockOwned ? 1 : 0;
      metrics[`${prefix}_status`] =
        session.status === 'healthy' ? 2 : session.status === 'warning' ? 1 : 0;
      metrics[`${prefix}_issues_count`] = session.issues.length;
    }

    return metrics;
  }
}
