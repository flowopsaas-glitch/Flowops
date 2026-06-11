import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ShipmentsRiskService } from "./shipments-risk.service";

@Controller("shipments-risk")
export class ShipmentsRiskController {
  constructor(private readonly risk: ShipmentsRiskService) {}

  // Example:
  // GET /api/shipments-risk/123
  @Get(":shipmentId")
  async getRisk(@Param("shipmentId") shipmentId: string) {
    const id = Number(shipmentId);
    return this.risk.getOrComputeForShipment(id);
  }

  // Example:
  // POST /api/shipments-risk/recalculate?companyId=1
  @Post("recalculate")
  async recalc(@Query("companyId") companyId?: string) {
    const cid = companyId ? Number(companyId) : undefined;
    return this.risk.recalculateForCompany(cid || 0);
  }
}
