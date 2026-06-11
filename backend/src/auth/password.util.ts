import * as bcrypt from 'bcryptjs';

export const hashPassword = async (plain: string) => {
  // bcryptjs handles salt generation internally when passing a number
  return await bcrypt.hash(plain, 10);
};

export const comparePassword = async (plain: string, hash: string) => {
  return await bcrypt.compare(plain, hash);
};
