// src/subscriptions/dto/create-subscription.dto.ts
import { IsString, IsDate } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  userId!: string;

  @IsDate()
  startDate!: Date;
}
