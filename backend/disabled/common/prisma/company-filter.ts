import { Role } from '../../auth/enums/role.enum';

// Example usage:
export const isAdmin = (role: Role) => {
  return role === Role.COMPANY_ADMIN || role === Role.SUPER_ADMIN;
};
