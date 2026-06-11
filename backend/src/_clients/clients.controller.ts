import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientsService, CreateClientDto } from './clients.service';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async findAll(@Req() req: any) {
    return this.clientsService.findAll(Number(req.user?.companyId));
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateClientDto) {
    return this.clientsService.create(Number(req.user?.companyId), dto);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Body() dto: Partial<CreateClientDto>) {
    return this.clientsService.update(id, Number(req.user?.companyId), dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.clientsService.remove(id, Number(req.user?.companyId));
  }
}
