import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { seedServices } from './seed-services';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  const clientId = process.env.SEED_CLIENT_ID;
  if (!clientId) {
    console.error('Error: SEED_CLIENT_ID environment variable required');
    process.exit(1);
  }

  try {
    console.log('Starting seed...');
    await seedServices(dataSource, clientId);
    console.log('Seed completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
