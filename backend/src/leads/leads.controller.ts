import { Controller, Post, Body } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('quote')
  async createQuote(@Body() createQuoteDto: CreateQuoteDto) {
    return this.leadsService.handleQuoteRequest(createQuoteDto);
  }
}
