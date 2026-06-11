import { Permission } from './permission.enum';

export const ROLE_PERMISSIONS = {
  ADMIN: Object.values(Permission),

  COMPANY_ADMIN: [
    Permission.READ_COMPANY,
    Permission.UPDATE_COMPANY,

    Permission.READ_USER,
    Permission.CREATE_USER,
    Permission.UPDATE_USER,

    Permission.READ_COLLECTION,
    Permission.CREATE_COLLECTION,
    Permission.UPDATE_COLLECTION,
    Permission.DELETE_COLLECTION,
  ],

  OPERATOR: [
    Permission.READ_COLLECTION,
    Permission.CREATE_COLLECTION,
  ],

  DRIVER: [
    Permission.READ_COLLECTION,
  ],
};
