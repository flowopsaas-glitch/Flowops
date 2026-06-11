import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export type CreateUserBody = {
  email: string;
  password?: string;
  name?: string;
  role?: string;
  permissions?: Record<string, boolean>;
};

export type UpdateUserBody = {
  email?: string;
  password?: string;
  role?: string;
  permissions?: Record<string, boolean>;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');

  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByCompany(companyId: number) {
    return this.prisma.user.findMany({ where: { companyId } });
  }

  async getById(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  /**
   * 🚀 ENTERPRISE CREATION LOGIC
   * Implements: R7,500 base (Admin) + R500/seat (Additional Users)
   */
  async createMyCompanyUser(companyId: number, body: CreateUserBody) {
    // 1. Check current user count to determine billing impact
    const userCount = await this.prisma.user.count({
      where: { companyId }
    });

    // 2. Audit the billing seat addition
    if (userCount === 0) {
      this.logger.log(`👑 Creating Primary Tenant Admin for Company ${companyId}. (Base Charge: R7500)`);
    } else {
      this.logger.log(`👤 Adding seat #${userCount + 1} to Company ${companyId}. (Incremental: +R500)`);
    }

    // 3. Secure the password if provided, or set a temporary one
    const hashedPassword = body.password 
      ? await bcrypt.hash(body.password, 10) 
      : undefined;

    try {
      return await this.prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          password: hashedPassword,
          name: body.name,
          role: (body.role as Role) || Role.OPERATOR,
          companyId,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to create enterprise seat: ${err.message}`);
      throw new BadRequestException("This email is already registered in FlowOps.");
    }
  }

  async updateMyCompanyUser(companyId: number, id: number, body: UpdateUserBody) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this company.');
    }

    return this.updateUserById(id, body);
  }
  // Add this method to your existing UsersService class

/**
 * 🚀 NEW: Reset user password (Owner/SuperAdmin action)
 */
async resetPassword(userId: number, newPassword: string) {
  const user = await this.prisma.user.findUnique({ where: { id: userId }});
  if (!user) throw new NotFoundException('User not found');

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  await this.prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  this.logger.log(`Password reset for user ${userId} (${user.email})`);
  return { success: true, message: 'Password updated successfully' };
}
  async updateAnyUserBySuperAdmin(id: number, body: UpdateUserBody) {
    return this.updateUserById(id, body);
  }

  private async updateUserById(id: number, body: UpdateUserBody) {
    const updateData: any = {};
    
    if (body.email) updateData.email = body.email.toLowerCase();
    if (body.role) updateData.role = body.role as Role;
    if (body.password) updateData.password = await bcrypt.hash(body.password, 10);

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  // Helper list methods
  async listAll() {
    return this.prisma.user.findMany({ include: { company: true } });
  }

  async listByCompany(companyId: number) {
    // Exclude SUPER_ADMIN (platform owner) — tenant admins must never see/manage it
    return this.prisma.user.findMany({
      where: {
        companyId,
        role: { not: 'SUPER_ADMIN' },
      },
    });
  }
}

