import { Module, Global } from '@nestjs/common';
import { BroadcastGateway } from './broadcast.gateway';

@Global() // Makes it available everywhere without re-importing
@Module({
  providers: [BroadcastGateway],
  exports: [BroadcastGateway],
})
export class BroadcastModule {}
