export type Permission = string;

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: ['ALL'],
  COMPANY_ADMIN: ['MANAGE_COMPANY', 'MANAGE_USERS'],
  OPERATOR: ['MANAGE_TASKS'],
  DRIVER: [],
};
