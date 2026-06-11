import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { WaybillDraftsService } from "./waybill-drafts.service";
import { Public } from "../../auth/public.decorator";

@Controller("waybills/drafts")
export class WaybillDraftsController {
  constructor(private svc: WaybillDraftsService) {}

  private mockCompanyId(): number {
    return 1;
  }

  @Public()
  @Get(":id")
  async get(@Param("id") id: string) {
    return this.svc.get(this.mockCompanyId(), id);
  }

  @Public()
  @Patch(":id")
  async patch(@Param("id") id: string, @Body() body: any) {
    return this.svc.update(this.mockCompanyId(), id, body);
  }
}