import { Module } from '@nestjs/common';
import { PublicToolsController } from './public-tools.controller';
import { PublicToolsService } from './public-tools.service';

@Module({
  controllers: [PublicToolsController],
  providers: [PublicToolsService],
  exports: [PublicToolsService],
})
export class PublicToolsModule {}
