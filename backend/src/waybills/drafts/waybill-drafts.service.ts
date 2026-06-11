import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class WaybillDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: number, id: string) {
    const draft = await this.prisma.waybillDraft.findUnique({
      where: { id },
      include: { parcels: true },
    });
    if (!draft || draft.companyId !== companyId) throw new NotFoundException("Draft not found");
    return draft;
  }

  async update(companyId: number, id: string, patch: any) {
    return this.prisma.waybillDraft.update({
      where: { id },
      data: {
        waybillNo: patch.waybillNo,
        senderName: patch.senderName,
        receiverName: patch.receiverName,
        receiverPhone: typeof patch.receiverPhone === "string" ? patch.receiverPhone : undefined,
      },
    });
  }
}
