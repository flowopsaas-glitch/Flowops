export class PrismaClient {
  constructor(_opts?: any) {}
  [key: string]: any;
  $connect = async () => undefined;
  $disconnect = async () => undefined;
  $transaction = async (fn: any) => fn(this);
  $executeRaw = async () => undefined;
}
export const CollectionStatus = { PENDING: 'PENDING', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS', CONFIRMED: 'CONFIRMED', CANCELLED: 'CANCELLED' };
export const TripCostType = { FUEL: 'FUEL', TOLL: 'TOLL', OTHER: 'OTHER' };
export type DriverMode = string;
export type UserRole = string;
export type PrismaTransactionClient = any;
export default PrismaClient;
