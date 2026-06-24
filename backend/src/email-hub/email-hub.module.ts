import { Module } from '@nestjs/common';
import { EmailHubController } from './email-hub.controller';
import { EmailHubService }    from './email-hub.service';

@Module({
  controllers: [EmailHubController],
  providers:   [EmailHubService],
  exports:     [EmailHubService],
})
export class EmailHubModule {}
