import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FakePrisma } from '../testing/fake-prisma';
import { PrismaService } from '../prisma/prisma.service';
import { CustomsService } from './customs.service';
import { CustomsEdiCredentialService } from './customs-edi/customs-edi-credential.service';
import { CustomsEdiTransportFactory } from './customs-edi/customs-edi-transport.factory';
import { CustomsDeclarationService } from './customs-declaration.service';

/**
 * A SAD declaration that reaches SARS twice is a customs incident, not a
 * nuisance: the consignment is held, and clearing it needs a formal
 * cancellation or amendment. These cases pin the rule that a declaration is
 * transmitted at most once, including when the caller crashes mid-submission.
 */
describe('CustomsDeclarationService', () => {
  const COMPANY_A = 'company-a';
  const COMPANY_B = 'company-b';

  let prisma: FakePrisma;
  let transmit: jest.Mock;
  let service: CustomsDeclarationService;

  const LODGED = { accepted: true, lodged: true, reference: 'SARS-REF-1', note: 'Lodged' };
  const NOT_LODGED = { accepted: false, lodged: false, reference: null, note: 'Handoff queued' };

  beforeEach(() => {
    prisma = new FakePrisma();
    transmit = jest.fn().mockResolvedValue(LODGED);

    const customs = { estimate: jest.fn().mockResolvedValue({ lines: [], totals: {} }) };
    const credentials = { decryptFor: jest.fn().mockResolvedValue({ companyId: COMPANY_A, path: 'DIRECT_EDI' }) };
    const transports = { forPath: jest.fn().mockReturnValue({ transmit }) };

    service = new CustomsDeclarationService(
      prisma as unknown as PrismaService,
      customs as unknown as CustomsService,
      credentials as unknown as CustomsEdiCredentialService,
      transports as unknown as CustomsEdiTransportFactory,
    );
  });

  async function makeDeclaration(companyId = COMPANY_A, status = 'DRAFT') {
    const file = await prisma.shipmentFile.create({
      data: {
        companyId,
        fileNumber: `IMP-2026-${companyId}`,
        mode: 'SEA',
        direction: 'IMPORT',
        loadType: 'FCL',
      },
    });
    return prisma.customsDeclaration.create({
      data: { companyId, fileId: file.id, type: 'IMPORT', status, lrn: 'LRN-1' },
    });
  }

  const messages = () => prisma.all('customsEdiMessage');

  describe('submit — a declaration is transmitted at most once', () => {
    it('records an in-flight transmission before it transmits', async () => {
      const d = await makeDeclaration();
      let seenBeforeTransmit: any[] = [];

      transmit.mockImplementation(async () => {
        seenBeforeTransmit = messages().map((m: any) => m.status);
        return LODGED;
      });

      await service.submit(COMPANY_A, d.id);

      // The claim is on disk before anything leaves the building. This is what
      // makes a crash mid-transmission safe: the next call sees it and refuses.
      expect(seenBeforeTransmit).toContain('SENT');
    });

    it('records the ACK and moves to SUBMITTED on a genuine acknowledgement', async () => {
      const d = await makeDeclaration();
      const updated = await service.submit(COMPANY_A, d.id);

      expect(updated.status).toBe('SUBMITTED');
      const ack = messages().find((m: any) => m.status === 'ACK');
      expect(ack).toBeTruthy();
      expect((ack as any).reference).toBe('SARS-REF-1');
    });

    it('keeps the status honest when SARS did not lodge it', async () => {
      const d = await makeDeclaration();
      transmit.mockResolvedValue(NOT_LODGED);

      const updated = await service.submit(COMPANY_A, d.id);

      expect(updated.status).toBe('DRAFT');
      expect(updated.responseNote).toBe('Handoff queued');
      expect(messages().some((m: any) => m.status === 'ERROR')).toBe(true);
    });

    it('refuses a second submission while one is still in flight', async () => {
      const d = await makeDeclaration();

      // Simulate the crash window: the claim is committed, the transmit happens,
      // but the outcome is never recorded.
      await prisma.customsEdiMessage.create({
        data: {
          declarationId: d.id,
          companyId: COMPANY_A,
          direction: 'OUTBOUND',
          messageType: 'CUSDEC',
          status: 'SENT',
        },
      });

      await expect(service.submit(COMPANY_A, d.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(transmit).not.toHaveBeenCalled();
    });

    it('refuses to re-transmit a declaration that already has an ack', async () => {
      const d = await makeDeclaration(COMPANY_A, 'SUBMITTED');
      await prisma.customsEdiMessage.create({
        data: {
          declarationId: d.id,
          companyId: COMPANY_A,
          direction: 'OUTBOUND',
          messageType: 'CUSDEC',
          status: 'ACK',
        },
      });

      await expect(service.submit(COMPANY_A, d.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(transmit).not.toHaveBeenCalled();
    });

    it('still allows a retry after a transmission that failed', async () => {
      const d = await makeDeclaration();
      await prisma.customsEdiMessage.create({
        data: {
          declarationId: d.id,
          companyId: COMPANY_A,
          direction: 'OUTBOUND',
          messageType: 'CUSDEC',
          status: 'ERROR',
        },
      });

      await service.submit(COMPANY_A, d.id);
      expect(transmit).toHaveBeenCalledTimes(1);
    });

    it('releases the claim and rethrows when the transport throws', async () => {
      const d = await makeDeclaration();
      transmit.mockRejectedValue(new Error('connection reset'));

      await expect(service.submit(COMPANY_A, d.id)).rejects.toThrow('connection reset');

      // The in-flight marker must not survive: nothing reached SARS, so the
      // operator has to be able to try again without calling support.
      expect(messages().some((m: any) => m.status === 'SENT')).toBe(false);
      expect(messages().some((m: any) => m.status === 'ERROR')).toBe(true);
    });

    it('takes the claim under an advisory lock on the declaration', async () => {
      const d = await makeDeclaration();
      const spy = jest.spyOn(prisma, '$queryRaw');
      await service.submit(COMPANY_A, d.id);

      const lockCall = spy.mock.calls.find((c) =>
        String((c[0] as any)?.join?.( '') ?? c[0]).includes('pg_advisory_xact_lock'),
      );
      expect(lockCall).toBeTruthy();
      spy.mockRestore();
    });

    it('runs the claim and the outcome inside a tenant context', async () => {
      const d = await makeDeclaration();
      const spy = jest.spyOn(prisma, 'withTenant');
      await service.submit(COMPANY_A, d.id);
      expect(spy).toHaveBeenCalledWith(COMPANY_A, expect.any(Function));
      spy.mockRestore();
    });

    it('will not submit another tenant’s declaration', async () => {
      const d = await makeDeclaration(COMPANY_B);
      await expect(service.submit(COMPANY_A, d.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(transmit).not.toHaveBeenCalled();
    });

    it('refuses a declaration that is past DRAFT or REJECTED', async () => {
      const d = await makeDeclaration(COMPANY_A, 'RELEASED');
      await expect(service.submit(COMPANY_A, d.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(transmit).not.toHaveBeenCalled();
    });
  });

  describe('setStatus — recording a SARS response', () => {
    it('records the response and moves the declaration', async () => {
      const d = await makeDeclaration(COMPANY_A, 'SUBMITTED');
      const updated = await service.setStatus(COMPANY_A, d.id, 'RELEASED', 'MRN-1', 'Cleared');
      expect(updated.status).toBe('RELEASED');
      expect(updated.mrn).toBe('MRN-1');
    });

    it('scopes the write to the calling company', async () => {
      const d = await makeDeclaration(COMPANY_A, 'SUBMITTED');
      const spy = jest.spyOn(prisma.customsDeclaration, 'updateMany');
      await service.setStatus(COMPANY_A, d.id, 'RELEASED');
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({
        id: d.id,
        companyId: COMPANY_A,
      });
      spy.mockRestore();
    });

    it('constrains the write on the status it read', async () => {
      const d = await makeDeclaration(COMPANY_A, 'SUBMITTED');
      const spy = jest.spyOn(prisma.customsDeclaration, 'updateMany');
      await service.setStatus(COMPANY_A, d.id, 'RELEASED');
      expect((spy.mock.calls[0][0] as any).where).toMatchObject({ status: 'SUBMITTED' });
      spy.mockRestore();
    });

    it('refuses when another response landed first', async () => {
      const d = await makeDeclaration(COMPANY_A, 'SUBMITTED');
      // SARS released it while this operator was typing in a query response.
      jest.spyOn(prisma.customsDeclaration, 'updateMany').mockResolvedValueOnce({ count: 0 });

      await expect(service.setStatus(COMPANY_A, d.id, 'QUERY')).rejects.toBeInstanceOf(
        ConflictException,
      );
      jest.restoreAllMocks();
    });

    it('refuses a status outside the lifecycle', async () => {
      const d = await makeDeclaration(COMPANY_A, 'SUBMITTED');
      await expect(service.setStatus(COMPANY_A, d.id, 'TELEPORTED')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('will not touch another tenant’s declaration', async () => {
      const d = await makeDeclaration(COMPANY_B, 'SUBMITTED');
      await expect(
        service.setStatus(COMPANY_A, d.id, 'RELEASED'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
