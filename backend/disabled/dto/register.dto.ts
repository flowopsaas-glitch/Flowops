export class RegisterDto {
  email: string;
  password: string;
  role: 'USER' | 'COMPANY_ADMIN' | 'SUPER_ADMIN';
  companyId?: number;
}
