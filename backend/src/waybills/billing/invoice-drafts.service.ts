import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class InvoiceDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: number) {
    return this.prisma.invoiceDraft.findMany({
      where: { companyId },
      include: { company: true },
    });
  }

  async get(companyId: number, id: string) {
    const draft = await this.prisma.invoiceDraft.findUnique({
      where: { id },
      include: { company: true, lines: true, waybills: true },
    });
    if (!draft || draft.companyId !== companyId) throw new NotFoundException("Draft not found");
    return draft;
  }

  async assistInvoiceDraft(id: string) {
    const draft = await this.prisma.invoiceDraft.findUnique({ where: { id }, include: { lines: true } });
    if (!draft) throw new NotFoundException("Draft not found");
    const subtotal = draft.lines.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
    return { ok: true, metrics: { subtotal, total: subtotal * 1.15 } };
  }

  async attachWaybillDraft(companyId: number, waybillDraftId: string) {
    return { success: true, message: "Attached" };
  }

  async lock(companyId: number, id: string) {
    return this.prisma.invoiceDraft.update({ where: { id, companyId }, data: { status: "LOCKED" } });
  }

  async issue(companyId: number, id: string) {
    return this.prisma.invoiceDraft.update({ where: { id, companyId }, data: { status: "SENT" } });
  }
}
