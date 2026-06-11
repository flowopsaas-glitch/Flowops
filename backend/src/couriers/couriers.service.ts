import { Injectable } from '@nestjs/common';

@Injectable()
export class CouriersService {
  create(name: string, phone: string) {
    return { name, phone };
  }

  findAll() {
    return [];
  }
}
