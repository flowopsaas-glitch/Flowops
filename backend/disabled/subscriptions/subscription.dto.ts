// src/subscriptions/subscription.dto.ts
import { IsString, IsDate } from 'class-validator';

export class SubscriptionDto {
  @IsString()
  userId!: string;

  @IsDate()
  startDate!: Date;
}
