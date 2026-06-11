import {
  Controller,
  Delete,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { UltimateGuard } from "../guards/ultimate.guard";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Delete(":id")
  @UseGuards(UltimateGuard)
  async deleteCustomer(@Param("id") id: string) {
    return this.customersService.delete(id);
  }
}
