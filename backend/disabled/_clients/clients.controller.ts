import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.enum';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  createClient(
    @Body()
    body: {
      companyName: string;
      contactEmail: string;
      contactPhone: string;
      whatsapp?: string;
    },
  ) {
    return this.clientsService.createClient(body);
  }

  @Get(':id/features')
  @Roles(Role.OWNER, Role.ADMIN)
  getFeatures(@Param('id') id: string) {
    return this.clientsService.getClientFeatures(id);
  }
}
