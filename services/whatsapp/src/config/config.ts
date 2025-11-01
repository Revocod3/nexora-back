import { Injectable } from '@nestjs/common';

export interface WhatsappEnv {
  TENANT_ID: string;
  WA_INTERNAL_SHARED_KEY?: string;
  CRM_BASE_URL?: string;
  CRM_API_KEY?: string;
}

function loadWhatsappEnv(): WhatsappEnv {
  return {
    TENANT_ID: process.env.SINGLE_TENANT_ID || 'tenant-dev',
    WA_INTERNAL_SHARED_KEY: process.env.WA_INTERNAL_SHARED_KEY,
    CRM_BASE_URL: process.env.CRM_BASE_URL,
    CRM_API_KEY: process.env.CRM_API_KEY,
  };
}

@Injectable()
export class WhatsappConfigService {
  private readonly env: WhatsappEnv = loadWhatsappEnv();
  get(): WhatsappEnv {
    return this.env;
  }
}
