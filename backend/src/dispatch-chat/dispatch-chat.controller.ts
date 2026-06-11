import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DispatchChatService } from './dispatch-chat.service';

@Controller('dispatch-chat')
@UseGuards(JwtAuthGuard)
export class DispatchChatController {
  constructor(private readonly dispatchChatService: DispatchChatService) {}

  @Get('drivers')
  async getActiveDrivers(@Req() req: any) {
    return this.dispatchChatService.getActiveDrivers(req.user.companyId);
  }

  @Get('messages')
  async getMessages(@Query('driverId') driverId: number, @Query('limit') limit: number = 50) {
    return this.dispatchChatService.getMessages(Number(driverId), Number(limit));
  }

  @Post('send')
  async sendMessage(
    @Body('driverId') driverId: number,
    @Body('message') message: string,
    @Body('type') type: string = 'text',
    @Req() req: any,
  ) {
    return this.dispatchChatService.sendMessage(
      Number(driverId),
      req.user.id,
      'dispatch',
      message,
      type,
    );
  }
}
