import { Controller, Get } from '@nestjs/common';
import { OrganisationService } from './organisation.service';

@Controller('organisation')
export class OrganisationController {
  constructor(private readonly service: OrganisationService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
