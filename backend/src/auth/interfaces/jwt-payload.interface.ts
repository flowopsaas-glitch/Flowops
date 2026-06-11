import { Role } from '../enums/role.enum';

export interface JwtPayload {
  id: string;  // UUID
  email: string;
  role: Role;
}
