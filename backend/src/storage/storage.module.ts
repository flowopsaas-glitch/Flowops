import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CloudflareR2Service } from './cloudflare-r2.service';

@Module({
  imports: [ConfigModule],
  providers: [CloudflareR2Service],
  exports: [CloudflareR2Service],
})
export class StorageModule {}
