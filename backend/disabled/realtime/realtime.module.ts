import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway], // ✅ Export so other modules can inject it
})
export class RealtimeModule {}
