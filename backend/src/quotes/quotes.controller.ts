import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller('quotes')
export class QuotesController {
  @Public()
  @Get()
  async getQuotes() {
    // Return an array of one empty quote object to prevent "length of undefined" errors
    return [{
      id: 1,
      customer: 'System Initializing...',
      amount: 0,
      status: 'PENDING',
      provider: 'FlowOps' // Added just in case line 281 is shared
    }]; 
  }
}
