import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.enum';

@Controller('customers')
export class CustomersController {
    @Get()
    @Roles(Role.COMPANY_ADMIN)
    findAll() { return { message: 'Customers accessible to COMPANY_ADMIN only' }; }
}
