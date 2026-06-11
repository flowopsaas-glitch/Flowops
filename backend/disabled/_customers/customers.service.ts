import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async delete(id: string) {
    const exists = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!exists) {
      throw new NotFoundException("Customer not found");
    }

    await this.prisma.customer.delete({
      where: { id },
    });

    return {
      status: "deleted",
      id,
    };
  }
}
