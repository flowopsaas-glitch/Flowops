import { Module } from '@nestjs/common';
import { EmailHubController } from './email-hub.controller';
import { EmailHubService } from './email-hub.service';
import { AttachmentScannerService } from './attachment-scanner.service';

@Module({
  controllers: [EmailHubController],
  providers: [EmailHubService, AttachmentScannerService],
  exports: [EmailHubService],
})
export class EmailHubModule {}
