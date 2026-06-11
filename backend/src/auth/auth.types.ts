export interface AuthedUser {
  id: number;
  email: string;
  role: string;
  companyId?: number;
}