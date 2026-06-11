export class CreateSubscriptionDto {
  userId: string;
  clientId: string;
  startDate: Date;
  endDate?: Date;
  plan?: string;
}
