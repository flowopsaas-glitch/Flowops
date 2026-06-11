import { Body, Controller, Get, Param, Post, Patch } from "@nestjs/common";
import { CompanyService } from "./company.service";

@Controller("company")
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  createCompany(
    @Body()
    body: {
      name: string;
      email: string;
      whatsapp: string;
    }
  ) {
    return this.companyService.create(body);
  }

  @Get(":id")
  getCompany(@Param("id") id: string) {
    return this.companyService.findById(id);
  }

  @Patch(":id/approve")
  approve(@Param("id") id: string) {
    return this.companyService.updateStatus(id, "APPROVED");
  }

  @Patch(":id/reject")
  reject(@Param("id") id: string) {
    return this.companyService.updateStatus(id, "REJECTED");
  }
}
