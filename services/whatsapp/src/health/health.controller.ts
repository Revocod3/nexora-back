import { Controller, Get } from '@nestjs/common';
import { SessionHealthService } from './session-health.js';
import { createLogger } from '@nexora/logger';

@Controller('health')
export class HealthController {
  private readonly log = createLogger({ service: 'connector-whatsapp-health-controller' });

  constructor(private readonly healthService: SessionHealthService) {}

  @Get()
  async getHealth() {
    try {
      const isHealthy = await this.healthService.isHealthy();
      const summary = await this.healthService.getHealthSummary();

      return {
        status: isHealthy ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        summary,
      };
    } catch (error) {
      this.log.error('health.endpoint.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('detailed')
  async getDetailedHealth() {
    try {
      const detailedStatus = await this.healthService.getDetailedHealthStatus();
      const summary = await this.healthService.getHealthSummary();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        summary,
        sessions: detailedStatus,
      };
    } catch (error) {
      this.log.error('health.detailed.endpoint.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('metrics')
  async getMetrics() {
    try {
      const metrics = await this.healthService.getHealthMetrics();

      // Return metrics in a format suitable for monitoring systems
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        metrics,
      };
    } catch (error) {
      this.log.error('health.metrics.endpoint.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Get('sessions')
  async getSessionStatus() {
    try {
      const detailedStatus = await this.healthService.getDetailedHealthStatus();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        sessions: detailedStatus.map((session) => ({
          tenantId: session.tenantId,
          workerId: session.workerId,
          connectionState: session.connectionState,
          isConnected: session.isConnected,
          status: session.status,
          issues: session.issues,
          lastSeen: new Date(session.lastSeen).toISOString(),
          qrAvailable: session.qrAvailable,
        })),
      };
    } catch (error) {
      this.log.error('health.sessions.endpoint.error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        service: 'whatsapp-connector',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
