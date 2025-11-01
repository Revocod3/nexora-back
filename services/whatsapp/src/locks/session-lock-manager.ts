import { Injectable } from '@nestjs/common';
import { RedisService } from '../auth/redis.service.js';
import { createLogger } from '../utils/logger.js';

export interface LockInfo {
  workerId: string;
  acquiredAt: number;
  ttlSeconds: number;
}

@Injectable()
export class SessionLockManager {
  private readonly log = createLogger('connector-whatsapp-lock-manager');
  private readonly lockPrefix = 'lock';
  private readonly renewalTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly redis: RedisService) { }

  /**
   * Attempt to acquire a distributed lock for a tenant session
   * @param tenantId The tenant identifier
   * @param workerId The worker identifier attempting to acquire the lock
   * @param ttlSeconds Time-to-live for the lock in seconds
   * @returns Promise<boolean> True if lock was acquired, false otherwise
   */
  async acquireLock(tenantId: string, workerId: string, ttlSeconds: number): Promise<boolean> {
    try {
      const lockKey = this.redis.getKey(this.lockPrefix, tenantId);
      const lockValue = JSON.stringify({
        workerId,
        acquiredAt: Date.now(),
        ttlSeconds,
      });

      const client = this.redis.getClient();

      // First check if we already own the lock
      const existingLockData = await client.get(lockKey);
      if (existingLockData) {
        const existingLock: LockInfo = JSON.parse(existingLockData);
        if (existingLock.workerId === workerId) {
          // We already own the lock, just renew it
          this.log.debug('lock.acquire.already_owned', {
            tenantId,
            workerId,
          });
          const renewed = await this.renewLock(tenantId, workerId, ttlSeconds);
          if (renewed) {
            // Start automatic renewal
            this.startRenewalTimer(tenantId, workerId, ttlSeconds);
            return true;
          } else {
            return false;
          }
        }
      }

      // Try to acquire the lock
      const result = await client.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');

      const acquired = result === 'OK';

      if (acquired) {
        this.log.info('lock.acquired', {
          tenantId,
          workerId,
          ttlSeconds,
        });

        // Start automatic renewal
        this.startRenewalTimer(tenantId, workerId, ttlSeconds);
      } else {
        this.log.debug('lock.acquire.failed', {
          tenantId,
          workerId,
          reason: 'already_locked',
        });
      }

      return acquired;
    } catch (error) {
      this.log.error('lock.acquire.error', {
        tenantId,
        workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Renew an existing lock
   * @param tenantId The tenant identifier
   * @param workerId The worker identifier
   * @param ttlSeconds New TTL for the lock
   * @returns Promise<boolean> True if lock was renewed, false otherwise
   */
  async renewLock(tenantId: string, workerId: string, ttlSeconds: number): Promise<boolean> {
    try {
      const lockKey = this.redis.getKey(this.lockPrefix, tenantId);
      const client = this.redis.getClient();

      // First check if we own the lock
      const currentLockData = await client.get(lockKey);
      if (!currentLockData) {
        this.log.warn('lock.renew.no_lock', { tenantId, workerId });
        return false;
      }

      const currentLock: LockInfo = JSON.parse(currentLockData);
      if (currentLock.workerId !== workerId) {
        this.log.warn('lock.renew.not_owner', {
          tenantId,
          workerId,
          currentOwner: currentLock.workerId,
        });
        return false;
      }

      // Update the lock with new TTL
      const newLockValue = JSON.stringify({
        workerId,
        acquiredAt: Date.now(),
        ttlSeconds,
      });

      // Set the lock with new TTL
      const result = await client.set(lockKey, newLockValue, 'EX', ttlSeconds, 'XX');

      const renewed = result === 'OK';

      if (renewed) {
        this.log.debug('lock.renewed', {
          tenantId,
          workerId,
          ttlSeconds,
        });
      } else {
        this.log.warn('lock.renew.failed', {
          tenantId,
          workerId,
          reason: 'update_failed',
        });
      }

      return renewed;
    } catch (error) {
      this.log.error('lock.renew.error', {
        tenantId,
        workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Release a lock if owned by the specified worker
   * @param tenantId The tenant identifier
   * @param workerId The worker identifier
   * @returns Promise<void>
   */
  async releaseLock(tenantId: string, workerId: string): Promise<void> {
    try {
      const lockKey = this.redis.getKey(this.lockPrefix, tenantId);
      const client = this.redis.getClient();

      // Use Lua script for atomic release
      const luaScript = `
        if redis.call('get', KEYS[1]) then
          local lockData = cjson.decode(redis.call('get', KEYS[1]))
          if lockData.workerId == ARGV[1] then
            redis.call('del', KEYS[1])
            return 1
          end
        end
        return 0
      `;

      const result = await client.eval(luaScript, 1, lockKey, workerId);

      if (result === 1) {
        this.log.info('lock.released', {
          tenantId,
          workerId,
        });

        // Stop renewal timer
        this.stopRenewalTimer(tenantId);
      } else {
        this.log.warn('lock.release.failed', {
          tenantId,
          workerId,
          reason: 'not_owner_or_no_lock',
        });
      }
    } catch (error) {
      this.log.error('lock.release.error', {
        tenantId,
        workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if a lock is owned by the specified worker
   * @param tenantId The tenant identifier
   * @param workerId The worker identifier
   * @returns Promise<boolean> True if lock is owned by the worker
   */
  async isLockOwned(tenantId: string, workerId: string): Promise<boolean> {
    try {
      const lockKey = this.redis.getKey(this.lockPrefix, tenantId);
      const client = this.redis.getClient();

      const lockData = await client.get(lockKey);
      if (!lockData) {
        return false;
      }

      const lock: LockInfo = JSON.parse(lockData);
      return lock.workerId === workerId;
    } catch (error) {
      this.log.error('lock.check.error', {
        tenantId,
        workerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get the current lock owner for a tenant
   * @param tenantId The tenant identifier
   * @returns Promise<string | null> The worker ID of the lock owner, or null if no lock
   */
  async getLockOwner(tenantId: string): Promise<string | null> {
    try {
      const lockKey = this.redis.getKey(this.lockPrefix, tenantId);
      const client = this.redis.getClient();

      const lockData = await client.get(lockKey);
      if (!lockData) {
        return null;
      }

      const lock: LockInfo = JSON.parse(lockData);
      return lock.workerId;
    } catch (error) {
      this.log.error('lock.get_owner.error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Force release a lock (admin operation)
   * @param tenantId The tenant identifier
   * @returns Promise<string | null> The worker ID that owned the lock, or null if no lock
   */
  async forceReleaseLock(tenantId: string): Promise<string | null> {
    try {
      const lockKey = this.redis.getKey(this.lockPrefix, tenantId);
      const client = this.redis.getClient();

      const lockData = await client.get(lockKey);
      if (!lockData) {
        return null;
      }

      const lock: LockInfo = JSON.parse(lockData);
      await client.del(lockKey);

      this.log.warn('lock.force_released', {
        tenantId,
        previousOwner: lock.workerId,
      });

      // Stop renewal timer if it exists
      this.stopRenewalTimer(tenantId);

      return lock.workerId;
    } catch (error) {
      this.log.error('lock.force_release.error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get all active locks (for monitoring)
   * @returns Promise<Record<string, LockInfo>> Map of tenantId to lock info
   */
  async getAllLocks(): Promise<Record<string, LockInfo>> {
    try {
      // Simplified for MVP - filesystem storage doesn't support distributed locks
      // Return empty object as distributed locking is disabled
      this.log.debug('lock.get_all.disabled', {
        reason: 'filesystem_storage_no_distributed_locks'
      });
      return {};
    } catch (error) {
      this.log.error('lock.get_all.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  /**
   * Start automatic renewal timer for a lock
   */
  private startRenewalTimer(tenantId: string, workerId: string, ttlSeconds: number): void {
    // Clear existing timer
    this.stopRenewalTimer(tenantId);

    // Renew at half the TTL interval
    const renewalInterval = Math.max(30, Math.floor(ttlSeconds / 2)) * 1000;

    const timer = setInterval(async () => {
      const renewed = await this.renewLock(tenantId, workerId, ttlSeconds);
      if (!renewed) {
        this.log.warn('lock.auto_renew.failed', {
          tenantId,
          workerId,
        });
        this.stopRenewalTimer(tenantId);
      }
    }, renewalInterval);

    this.renewalTimers.set(tenantId, timer);

    this.log.debug('lock.renewal_timer.started', {
      tenantId,
      workerId,
      renewalInterval: renewalInterval / 1000,
    });
  }

  /**
   * Stop automatic renewal timer for a lock
   */
  private stopRenewalTimer(tenantId: string): void {
    const timer = this.renewalTimers.get(tenantId);
    if (timer) {
      clearInterval(timer);
      this.renewalTimers.delete(tenantId);

      this.log.debug('lock.renewal_timer.stopped', {
        tenantId,
      });
    }
  }

  /**
   * Clean up all renewal timers (for graceful shutdown)
   */
  cleanup(): void {
    for (const [tenantId, timer] of this.renewalTimers) {
      clearInterval(timer);
      this.log.debug('lock.renewal_timer.cleaned', {
        tenantId,
      });
    }
    this.renewalTimers.clear();
  }
}
