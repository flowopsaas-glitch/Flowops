import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QuotesService } from './quotes.service';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('Quotes')
@ApiBearerAuth()
@Controller('quotes')
export class QuotesController {
  constructor(private readonly svc: QuotesService) {}

  @Get()
  findAll(@CurrentUser() u: any) {
    return this.svc.findAll(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: any, @Body() body: any) {
    return this.svc.create(u.companyId, body);
  }

  @Patch(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.accept(id, u.companyId);
  }
}
