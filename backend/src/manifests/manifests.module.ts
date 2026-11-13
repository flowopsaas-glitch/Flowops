import { Module } from '@nestjs/common';
import { ManifestsController } from './manifests.controller';
import { ManifestsService } from './manifests.service';
import { LoadScanController } from './load-scan.controller';
import { LoadScanService } from './load-scan.service';

@Module({
  controllers: [ManifestsController, LoadScanController],
  providers: [ManifestsService, LoadScanService],
  exports: [ManifestsService, LoadScanService],
})
export class ManifestsModule {}
