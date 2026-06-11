import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller'; 
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy'; 
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module'; 

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PrismaModule, 
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'dev-secret-change-me',
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '15m',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy], 
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
