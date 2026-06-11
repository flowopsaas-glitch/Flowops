import { 
  Controller, Get, Post, Body, Param, Delete, 
  UseGuards, Req, UseInterceptors, UploadedFile, ParseIntPipe 
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { WaybillsInboxService } from "./waybills-inbox.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { diskStorage } from "multer";
import { extname } from "path";
import { CommitWaybillDto } from "./dto/commit-waybill.dto";
import { SubscriptionGuard } from '../../auth/guards/subscription.guard'; // Ensure this matches Step 2

@Controller("waybills/inbox")
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class WaybillsInboxController {
  constructor(private readonly inbox: WaybillsInboxService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.inbox.list(req.user.companyId);
  }

  @Post("verify-collection")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads",
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, `ai-verify-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async verifyCollection(
    @UploadedFile() file: Express.Multer.File,
    @Body('reference') reference: string,
    @Req() req: any,
  ) {
    return this.inbox.processCollectionAI(
      req.user.companyId,
      req.user.id,
      reference,
      file
    );
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: "./uploads",
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.inbox.upload(req.user.companyId, req.user.id, body.source || "UPLOAD", file);
  }

  @Post(":id/commit")
  async commit(
    @Param("id", ParseIntPipe) id: number, 
    @Body() dto: CommitWaybillDto,
    @Req() req: any
  ) {
    return this.inbox.commit(req.user.companyId, req.user.id, id, dto);
  }

  @Post(":id/assist")
  assist(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    return this.inbox.assist(req.user.companyId, id);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.inbox.remove(id);
  }
}
