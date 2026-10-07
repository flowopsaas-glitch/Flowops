import {
  Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { OwnerAuthGuard } from '../common/guards/owner-auth.guard';
import { RailTimetableService } from './rail-timetable.service';

@ApiTags('Owner / Rail reference data')
@ApiBearerAuth()
@Controller('owner/rail')
@UseGuards(OwnerAuthGuard)
@Public()
export class RailTimetableOwnerController {
  constructor(private readonly timetable: RailTimetableService) {}

  @Post('schedules/import')
  @ApiOperation({ summary: 'Publish a shared Transnet Annexure 33a timetable to rail tenants' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  importSharedTimetable(
    @CurrentUser() owner: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.timetable.importSharedFile(owner.id, file);
  }

  @Get('schedules/imports')
  @ApiOperation({ summary: 'List published shared rail timetable references' })
  listSharedTimetables() {
    return this.timetable.listSharedImports();
  }
}
