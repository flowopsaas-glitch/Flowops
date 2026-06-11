import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RequestWithUser } from '../auth/request-with-user.interface';

@Controller('user')
export class UserController {
  constructor(private readonly usersService: UsersService) {}

  @Get('company')
  async getCompanyUsers(@Req() req: RequestWithUser) {
    const companyId = req.user?.companyId;
    if (!companyId) throw new UnauthorizedException('User not authorized');
    
    // 🚀 FIXED: Cast companyId to String to match the new UsersService signature
    return this.usersService.findByCompany(companyId); 
  }
}
