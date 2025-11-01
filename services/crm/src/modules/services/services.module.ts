import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesService } from './services.service';
import { Service, Client } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Service, Client])],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
