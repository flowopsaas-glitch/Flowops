import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/** Global — StorageService is available in every feature module. */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
