import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
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

  /**
   * Request a password reset. Always returns success (don't reveal if email exists).
   * Generates a secure token, stores it with 1-hour expiry, and emails a reset link.
   */
  async forgotPassword(email: string) {
    const safeEmail = String(email || '').trim().toLowerCase();
    if (!safeEmail || !safeEmail.includes('@')) {
      throw new BadRequestException('Valid email is required');
    }

    const user = await this.prisma.user.findUnique({ where: { email: safeEmail } });

    // Always return success to prevent email enumeration
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${safeEmail}`);
      return { message: 'If an account exists with that email, a reset link has been sent.' };
    }

    // Generate secure token (1 hour expiry)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpires: expires },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    try {
      await this.mailService.safeSendInternal({
        to: user.email,
        subject: 'FlowOps — Reset Your Password',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #6C9EFF;">Reset Your Password</h1>
            <p>Hi ${user.name || 'there'},</p>
            <p>We received a request to reset your FlowOps password. Click the button below to set a new password:</p>
            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #6C9EFF, #A78BFA); color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0;">
              Reset Password
            </a>
            <p style="font-size: 12px; color: #64748b;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 16px;">Or copy this link: ${resetUrl}</p>
          </div>
        `,
      });
      console.log(`Password reset link sent to ${user.email}`);
    } catch (e) {
      console.error('Failed to send reset email:', e);
    }

    return { message: 'If an account exists with that email, a reset link has been sent.' };
  }

  /**
   * Verify a reset token is valid and not expired.
   */
  async verifyResetToken(token: string) {
    if (!token) throw new BadRequestException('Token is required');
    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }
    return { valid: true, email: user.email };
  }

  /**
   * Reset the password using a valid token.
   */
  async resetPassword(token: string, newPassword: string) {
    if (!token) throw new BadRequestException('Token is required');
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const user = await this.prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    console.log(`Password reset successful for ${user.email}`);
    return { message: 'Password reset successful. You can now log in with your new password.' };
  }
}
