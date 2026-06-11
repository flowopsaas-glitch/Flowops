import { Role } from './roles.enum';

export interface RequestWithUser extends Request {
  user?: {
    userId: number;
    id?: number;
    email: string;
    role: Role;
    companyId: number;
  };
  companyId?: number;
  userId?: number;
}