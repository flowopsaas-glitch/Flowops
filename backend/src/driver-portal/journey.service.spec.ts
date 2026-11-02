import { JourneyStatus } from '@prisma/client';
import { JourneyService } from './journey.service';

function makeService(journeyOverrides: Record<string, unknown> = {}) {
  const journey = {
    id: 'journey-1',
    status: JourneyStatus.PLANNED,
    actualStart: null,
    actualEnd: null,
    driver: { id: 'driver-1', name: 'A Driver' },
    ...journeyOverrides,
  };
  const prisma = {
    journey: {
      findFirst: jest.fn(async () => journey),
      update: jest.fn(async ({ data }: any) => ({ ...journey, ...data })),
    },
    journeyUpdate: {
      findMany: jest.fn(async () => [{ id: 'update-1', journeyId: journey.id, stage: null }]),
    },
  };
  const audit = { record: jest.fn(async () => undefined) };
  return { service: new JourneyService(prisma as any, audit as any), prisma, journey };
}

describe('JourneyService', () => {
  describe('getJourneyUpdates', () => {
    it('returns the journey driver from the valid Journey relation', async () => {
      const { service, prisma } = makeService();

      const updates = await service.getJourneyUpdates('company-1', 'journey-1');

      expect(prisma.journey.findFirst).toHaveBeenCalledWith({
        where: { id: 'journey-1', companyId: 'company-1' },
        select: { id: true, driver: { select: { id: true, name: true } } },
      });
      expect(prisma.journeyUpdate.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { journeyId: 'journey-1', companyId: 'company-1' },
        include: { stage: { select: { id: true, stageNumber: true, type: true, locationName: true } } },
      }));
      expect(updates[0].driver).toEqual({ id: 'driver-1', name: 'A Driver' });
    });
  });

  describe('updateJourneyStatus', () => {
    it('stamps actualStart when a planned journey enters transit', async () => {
      const { service, prisma } = makeService();

      await service.updateJourneyStatus('company-1', 'journey-1', JourneyStatus.IN_TRANSIT);

      expect(prisma.journey.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'journey-1' },
        data: { status: JourneyStatus.IN_TRANSIT, actualStart: expect.any(Date) },
      }));
    });

    it('does not replace the first actual start or completion timestamp', async () => {
      const actualStart = new Date('2026-10-01T10:00:00.000Z');
      const actualEnd = new Date('2026-10-01T12:00:00.000Z');
      const { service, prisma } = makeService({ actualStart, actualEnd });

      await service.updateJourneyStatus('company-1', 'journey-1', JourneyStatus.COMPLETED);

      expect(prisma.journey.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: JourneyStatus.COMPLETED },
      }));
    });
  });
});
