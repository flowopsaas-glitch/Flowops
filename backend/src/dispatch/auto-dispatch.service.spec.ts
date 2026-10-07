import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AutoDispatchService } from './auto-dispatch.service';

describe('AutoDispatchService compliance enforcement', () => {
  it('does not assign an available driver whose vehicle service is overdue', async () => {
    const prisma = {
      waybill: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'waybill-1',
          trackingNumber: 'FO-1',
          senderLat: null,
          senderLng: null,
          recipientLat: null,
          recipientLng: null,
        }),
      },
      driver: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'driver-1',
          name: 'Overdue Driver',
          phone: '000',
          status: 'AVAILABLE',
          lastLat: null,
          lastLng: null,
          vehicleType: 'van',
          currentKm: 20_000,
          nextServiceKm: 10_000,
          nextServiceDate: null,
        }]),
      },
      shipment: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    const service = new AutoDispatchService(prisma, {} as ConfigService);
    const result = await service.dispatch('company-1', 'waybill-1');

    expect(result.assigned).toBe(false);
    expect(result.candidates).toHaveLength(0);
    expect(result.reason).toContain('No suitable driver');
  });
});
