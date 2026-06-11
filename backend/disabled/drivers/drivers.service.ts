import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.driver.findMany();
  }

  findOne(id: number) {
    return this.prisma.driver.findUnique({ where: { id } });
  }

  update(id: number, data: any) {
    return this.prisma.driver.update({ where: { id }, data });
  }
}
