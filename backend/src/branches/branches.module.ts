import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { ManifestService } from './manifest.service'; // 🚀 Import it
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BranchesController],
  providers: [
    BranchesService, 
    ManifestService // 🚀 Add this to the providers list
  ],
  exports: [BranchesService, ManifestService],
})
export class BranchesModule {}
