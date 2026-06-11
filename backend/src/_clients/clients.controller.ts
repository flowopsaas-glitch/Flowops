import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.enum';

@Controller('clients')
export class ClientsController {
    @Get()
    @Roles(Role.COMPANY_ADMIN)
    findAll() { return { message: 'Clients accessible to COMPANY_ADMIN only' }; }
}
