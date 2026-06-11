// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
// import { CompaniesController } from './companies.controller'; // ← REMOVED: duplicate route conflict
import { SettingsHelperController } from './settings-helper.controller';
import { BookingPortalController } from './booking-portal.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UsersService],
  controllers: [
    UsersController, 
    // CompaniesController,  // ← REMOVED: was causing route conflict with src/companies/
    SettingsHelperController,
    BookingPortalController
  ],
  exports: [UsersService],
})
export class UsersModule {}
