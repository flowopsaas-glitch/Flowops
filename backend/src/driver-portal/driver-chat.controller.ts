import { Controller, Get, Post, Body, Query, Param, Patch } from '@nestjs/common';
import { DriverChatService } from './driver-chat.service';

@Controller('driver-portal/chat')
export class DriverChatController {
  constructor(private readonly driverChatService: DriverChatService) {}

  @Get('messages/:driverId')
  async getMessages(@Param('driverId') driverId: string, @Query('limit') limit: number = 50, @Query('skip') skip: number = 0) {
    return this.driverChatService.getMessages(Number(driverId), Number(limit), Number(skip));
  }

  @Post('send')
  async sendMessage(@Body() body: any) {
    return this.driverChatService.sendMessage(
      Number(body.driverId), Number(body.senderId || body.driverId), body.senderType || 'driver',
      body.message, body.type || 'text', body.attachmentUrl, body.attachmentType
    );
  }

  @Patch('read/:driverId')
  async markAsRead(@Param('driverId') driverId: string, @Body('readerType') readerType: 'driver' | 'dispatch') {
    return this.driverChatService.markAsRead(Number(driverId), readerType || 'driver');
  }

  @Post('typing/:driverId')
  async setTyping(@Param('driverId') driverId: string, @Body('isTyping') isTyping: boolean) {
    this.driverChatService.setTyping(Number(driverId), isTyping);
    return { success: true };
  }

  @Get('typing/:driverId')
  async getTyping(@Param('driverId') driverId: string) {
    return { isTyping: this.driverChatService.getTypingStatus(Number(driverId)) };
  }
}
