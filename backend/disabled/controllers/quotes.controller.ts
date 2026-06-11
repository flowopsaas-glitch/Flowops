import { Controller, Get, Param, Patch, Delete, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { QuotesService } from '../services/quotes.service';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  async getQuotes(@Req() req: Request, @Res() res: Response) {
    try {
      const quotes = await this.quotesService.getQuotes();
      res.json(quotes);
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  @Patch(':id')
  async updateQuote(
    @Param('id') id: string,
    @Body() data: any,
    @Req() req: Request,
    @Res() res: Response
  ) {
    try {
      const updated = await this.quotesService.updateQuote(Number(id), data);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  @Delete(':id')
  async deleteQuote(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    try {
      const deleted = await this.quotesService.deleteQuote(Number(id));
      res.json(deleted);
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
