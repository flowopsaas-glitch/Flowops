import { Module } from '@nestjs/common';
import { ManifestsController } from './manifests.controller';
import { ManifestsService } from './manifests.service';
import { LoadScanController } from './load-scan.controller';

@Module({
  controllers: [ManifestsController, LoadScanController],
  providers: [ManifestsService],
  exports: [ManifestsService],
})
export class ManifestsModule {}
