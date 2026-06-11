// backend/src/whatsapp/whatsapp.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards, 
  Request, 
  Logger,
  BadRequestException 
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppDriverService } from './whatsapp-driver.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly driverService: WhatsAppDriverService,
  ) {}

  /**
   * GET /api/v1/whatsapp/threads
   * Get active WhatsApp threads for company
   */
  @Get('threads')
  async getThreads(@Request() req: any) {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        throw new BadRequestException('Company ID required');
      }
      
      const threads = await this.whatsappService.getActiveThreads(companyId);
      // ✅ Ensure array response for frontend
      return Array.isArray(threads) ? threads : [];
    } catch (error: any) {
      this.logger.error(`Failed to get threads: ${error?.message}`, error?.stack);
      return []; // ✅ Return empty array instead of crashing
    }
  }

  /**
   * GET /api/v1/whatsapp/messages/:phone
   * Get messages for a specific phone number
   */
  @Get('messages/:phone')
  async getMessages(@Param('phone') phone: string, @Request() req: any) {
    try {
      const companyId = req.user?.companyId;
      if (!phone) {
        throw new BadRequestException('Phone number required');
      }
      
      const messages = await this.whatsappService.getMessagesByPhone(phone, companyId);
      // ✅ Ensure array response for frontend
      return Array.isArray(messages) ? messages : [];
    } catch (error: any) {
      this.logger.error(`Failed to get messages: ${error?.message}`, error?.stack);
      return []; // ✅ Return empty array instead of crashing
    }
  }

  /**
   * POST /api/v1/whatsapp/send
   * Send a WhatsApp message
   */
  @Post('send')
  async sendMessage(
    @Body() body: { to: string; message: string }, 
    @Request() req: any
  ) {
    try {
      const companyId = req.user?.companyId;
      const { to, message } = body;
      
      if (!to || !message) {
        throw new BadRequestException('Phone number and message are required');
      }
      
      const result = await this.whatsappService.sendMessage(to, message, companyId);
      return { 
        success: true, 
        messageId: result?.id || null,
        status: result?.status || 'queued'
      };
    } catch (error: any) {
      this.logger.error(`Failed to send message: ${error?.message}`, error?.stack);
      throw new BadRequestException(error?.message || 'Failed to send message');
    }
  }

  /**
   * POST /api/v1/whatsapp/webhook
   * Handle incoming WhatsApp webhooks (public endpoint)
   */
  @Public()
  @Post('webhook')
  async handleWebhook(@Body() payload: any) {
    try {
      // Process as driver message first
      const phone = payload.from || payload.phoneNumber || payload.phone;
      const message = payload.message || payload.text || payload.body;
      const companyId = payload.companyId || 1;
      
      if (phone && message) {
        await this.driverService.handleDriverMessage(phone, message, companyId);
      }
      
      // Also process with original handler
      await this.whatsappService.handleWebhook(payload);
      return { received: true };
    } catch (error: any) {
      this.logger.error(`Webhook handling failed: ${error?.message}`, error?.stack);
      return { received: true, error: error?.message };
    }
  }
}
