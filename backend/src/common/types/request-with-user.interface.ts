import { Request } from 'express';

export interface RequestWithUser extends Request {
  companyId: number;
  userId: number;
  user?: any; // Optional if you still want the original user
}