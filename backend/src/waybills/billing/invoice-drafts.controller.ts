import { Controller, Get, Param, Post } from "@nestjs/common";
import { InvoiceDraftsService } from "./invoice-drafts.service";
import { Public } from "../../auth/public.decorator";

@Controller("invoices/drafts")
export class InvoiceDraftsController {
  constructor(private svc: InvoiceDraftsService) {}

  private mockCompanyId(): number {
    return 1;
  }

  @Public()
  @Get()
  async list() {
    return this.svc.list(this.mockCompanyId());
  }

  @Public()
  @Get(":id")
  async get(@Param("id") id: string) {
    return this.svc.get(this.mockCompanyId(), id);
  }

  @Public()
  @Post("attach/:waybillDraftId")
  async attach(@Param("waybillDraftId") waybillDraftId: string) {
    return this.svc.attachWaybillDraft(this.mockCompanyId(), waybillDraftId);
  }

  @Public()
  @Post(":id/lock")
  async lock(@Param("id") id: string) {
    return this.svc.lock(this.mockCompanyId(), id);
  }

  @Public()
  @Post(":id/issue")
  async issue(@Param("id") id: string) {
    return this.svc.issue(this.mockCompanyId(), id);
  }
}