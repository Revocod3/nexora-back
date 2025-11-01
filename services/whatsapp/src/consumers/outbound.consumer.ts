import { Injectable } from '@nestjs/common';
import { createLogger } from '../utils/logger.js';

// Simplified consumer - for MVP we use direct HTTP calls instead of message bus
@Injectable()
export class OutboundConsumer {
  private readonly log = createLogger('connector-whatsapp-outbound-consumer');

  constructor() {
    this.log.info('Outbound consumer initialized (bus disabled in MVP)');
  }
}
