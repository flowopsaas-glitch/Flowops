import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  create(data: {
    name: string;
    email: string;
    whatsapp: string;
  }) {
    return this.prisma.company.create({
      data: {
        name: data.name,
        email: data.email,
        whatsapp: data.whatsapp,
        status: "PENDING",
      },
    });
  }

  findById(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
    });
  }

  updateStatus(id: string, status: "APPROVED" | "REJECTED") {
    return this.prisma.company.update({
      where: { id },
      data: { status },
    });
  }
}
