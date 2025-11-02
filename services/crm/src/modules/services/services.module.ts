import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesService } from './services.service';
import { Service, Tenant } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Tenant])],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
