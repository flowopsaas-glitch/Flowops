import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

/** Minimal shape of the acting (authenticated) user passed from the controller. */
interface Actor { id?: string; role?: string }

/** All valid roles, for validating client-supplied role values. */
const VALID_ROLES: string[] = Object.values(UserRole);

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private billing: BillingService) {}

  /** Validate a client-supplied role string against the enum. */
  private assertValidRole(role: unknown): UserRole {
    const r = String(role).toUpperCase();
    if (!VALID_ROLES.includes(r)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }
    return r as UserRole;
  }

  async findByCompany(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        permissions: true, isActive: true, emailVerified: true, createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId },
      include: { notificationPreference: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safe } = user;
    return safe;
  }

  async create(companyId: string, dto: any, _actor?: Actor) {
    await this.billing.assertCanCreate(companyId, 'user');
    if (!dto?.email) throw new BadRequestException('Email is required');
    // Validate the requested role (defaults to USER). Only ADMIN/COMPANY_ADMIN
    // reach this method (controller @Roles), so they may assign any valid role.
    const role = dto.role !== undefined ? this.assertValidRole(dto.role) : UserRole.USER;
    const passwordHash = await bcrypt.hash(dto.password ?? uuid(), 12);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: String(dto.email).toLowerCase(),
          name: dto.name ?? String(dto.email).split('@')[0],
          phone: dto.phone ?? null,
          role,
          permissions: dto.permissions ?? undefined,
          passwordHash,
          companyId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('A user with this email already exists in your company.');
      }
      throw e;
    }
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async update(id: string, companyId: string, dto: any, actor?: Actor) {
    // TENANT SAFETY: the target user MUST belong to the caller's company.
    // Previously this updated by id ONLY, so a user in company A could edit
    // (and privilege-escalate) users in company B.
    const target = await this.prisma.user.findFirst({
      where: { id, companyId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // Whitelist updatable fields so stray keys never reach Prisma.
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.permissions !== undefined) data.permissions = dto.permissions;
    if (dto.isActive !== undefined) data.isActive = Boolean(dto.isActive);
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);

    if (dto.role !== undefined) {
      const newRole = this.assertValidRole(dto.role);
      // Prevent self-lockout: an admin can't demote themselves out of an admin
      // role (which would strip their ability to manage users) in one step.
      if (actor?.id && actor.id === id &&
          (actor.role === UserRole.ADMIN || actor.role === UserRole.COMPANY_ADMIN) &&
          newRole !== UserRole.ADMIN && newRole !== UserRole.COMPANY_ADMIN) {
        throw new ForbiddenException('You cannot remove your own administrator role.');
      }
      data.role = newRole;
    }

    const user = await this.prisma.user.update({ where: { id }, data });
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async remove(id: string, companyId: string, actor?: Actor) {
    // Prevent deactivating yourself (would lock the admin out of their own account).
    if (actor?.id && actor.id === id) {
      throw new ForbiddenException('You cannot deactivate your own account.');
    }
    // TENANT SAFETY: only deactivate a user within the caller's company
    // (was update by id only → cross-tenant deactivation).
    const result = await this.prisma.user.updateMany({
      where: { id, companyId },
      data: { isActive: false },
    });
    if (result.count === 0) throw new NotFoundException('User not found');
    return { message: 'User deactivated' };
  }
}
