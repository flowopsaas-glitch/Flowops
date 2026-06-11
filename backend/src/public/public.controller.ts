import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { PublicService } from './public.service';

@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('quotes/:token')
  getPublicQuote(@Param('token') token: string) {
    return this.publicService.getPublicQuote(token);
  }

  @Get('quotes/:token/pdf')
  async getPublicQuotePdf(@Param('token') token: string, @Res() res: Response) {
    const { fileName, pdfBuffer } = await this.publicService.getPublicQuotePdf(token);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(pdfBuffer);
  }

  @Post('quotes/:token/accept')
  acceptPublicQuote(
    @Param('token') token: string,
    @Body() body: { name?: string; email?: string },
  ) {
    return this.publicService.acceptPublicQuote(token, body);
  }
}