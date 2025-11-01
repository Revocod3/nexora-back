import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { initTracing } from './utils/tracing.js';
import { AppModule } from './app.module.js';
import { loadOrchestratorEnv } from './utils/config.js';

async function bootstrap() {
  const env = loadOrchestratorEnv();
  const tracing = initTracing({
    serviceName: 'connector-whatsapp',
    disabled: process.env.TRACING_DISABLED === '1',
  });
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableShutdownHooks();
  const origClose = app.close.bind(app);
  app.close = async () => {
    await tracing.shutdown();
    return origClose();
  };
  const port = parseInt(process.env.WA_PORT || '3011');
  await app.listen(port);
  console.log(`🚀 WhatsApp Connector running on port ${port}`);
  console.log(`📱 QR endpoint: http://localhost:${port}/wa/qr`);
}
if (process.argv[1] === new URL(import.meta.url).pathname) bootstrap();
