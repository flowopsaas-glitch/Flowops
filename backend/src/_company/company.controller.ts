import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.enum';

@Controller('company')
export class CompanyController {
    @Get()
    @Roles(Role.ADMIN)
    findAll() { return { message: 'Company accessible to ADMIN only' }; }
}
