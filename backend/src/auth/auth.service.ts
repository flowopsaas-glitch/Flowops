import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: any, password: any) {
    // ✅ FIX: Convert to string safely and trim
    const safeEmail = String(email || '').trim().toLowerCase();
    const safePassword = String(password || '');

    console.log(`🔐 Login attempt: email="${safeEmail}", passwordLength=${safePassword.length}`);

    if (!safeEmail || !safeEmail.includes('@')) {
      throw new UnauthorizedException('Invalid email format');
    }
    if (!safePassword) {
      throw new UnauthorizedException('Password is required');
    }
    
    const user = await this.prisma.user.findUnique({
      where: { email: safeEmail },
    });

    if (!user) {
      console.log(`❌ User not found for email: ${safeEmail}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    console.log(`✅ User found: ${user.email}, role: ${user.role}`);

    // Compare password using bcrypt
    const isValidPassword = await bcrypt.compare(safePassword, user.password);
    
    if (!isValidPassword) {
      console.log(`❌ Password mismatch for user: ${safeEmail}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    console.log(`✅ Login successful for: ${safeEmail}`);

    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      companyId: user.companyId
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        name: user.name,
        isVerified: user.isVerified
      },
    };
  }

  async ownerLogin(email: string, password: string) {
    return this.login(email, password);
  }

  async refreshSession(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newPayload = { 
        sub: user.id, 
        email: user.email, 
        role: user.role,
        companyId: user.companyId
      };

      return {
        accessToken: this.jwtService.sign(newPayload),
        refreshToken: this.jwtService.sign(newPayload, { expiresIn: '7d' }),
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async me(user: any) {
    if (!user?.id && !user?.userId) {
      throw new UnauthorizedException('Invalid user context');
    }

    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id || user.userId },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        name: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }

    return fullUser;
  }
}
