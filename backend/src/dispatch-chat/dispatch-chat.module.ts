import { Module } from '@nestjs/common';
import { DispatchChatController } from './dispatch-chat.controller';
import { DispatchChatService } from './dispatch-chat.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DispatchChatController],
  providers: [DispatchChatService],
})
export class DispatchChatModule {}
