import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from "./users.service";
import { Roles } from "../auth/roles.decorator";

type UpdateUserBody = {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
  role?: string;
};

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  private readonly logger = new Logger('UsersController');
  
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  async getMe(@Req() req: any) {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    
    try {
      const user = await this.usersService.getById(userId);
      
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      
      const { password, ...userWithoutPassword } = user;
      
      this.logger.debug(`User ${userId} fetched profile`);
      
      return userWithoutPassword;
    } catch (error) {
      this.logger.error(`Failed to fetch user ${userId}:`, error);
      throw error;
    }
  }

  @Get()
  @Roles("SUPER_ADMIN")
  async listAll() {
    return this.usersService.listAll();
  }

  @Get("my-company")
  @Roles("ADMIN", "COMPANY_ADMIN", "SUPER_ADMIN")
  async listMyCompany(@Req() req: any) {
    const companyId = Number(req?.user?.companyId ?? 1);
    if (!companyId) throw new BadRequestException("No tenant company linked.");
    return this.usersService.listByCompany(companyId);
  }

  @Post('my-company')
  @Roles("ADMIN", "COMPANY_ADMIN", "SUPER_ADMIN")
  async createMyCompanyUser(@Req() req: any, @Body() body: any) {
    const companyId = Number(req?.user?.companyId ?? 1);
    return this.usersService.createMyCompanyUser(companyId, body);
  }

  @Patch(":id")
  @Roles("ADMIN", "SUPER_ADMIN", "COMPANY_ADMIN")
  async updateUser(
    @Req() req: any,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateUserBody
  ) {
    const userRole = String(req?.user?.role || "").toUpperCase();
    
    if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
      return this.usersService.updateAnyUserBySuperAdmin(id, body);
    } else {
      const companyId = Number(req?.user?.companyId ?? 1);
      return this.usersService.updateMyCompanyUser(companyId, id, body);
    }
  }

  @Post(':id/reset-password')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { newPassword: string }
  ) {
    if (!body.newPassword || body.newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    return this.usersService.resetPassword(id, body.newPassword);
  }

  @Get(":id")
  @Roles("SUPER_ADMIN")
  async getById(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.getById(id);
  }
}
