import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { OwnerService } from './owner.service';

/**
 * `ApprovalRequest.passwordHash` holds the bcrypt hash of the password a
 * PENDING tenant admin chose at registration. The schema comment on the column
 * says it is "consumed and cleared after the admin account is created on
 * approval. Kept separate so it is never exposed in approval request listings."
 *
 * The listing exposed it anyway: `getApprovalRequests()` returned whole rows for
 * every pending and rejected signup in the platform, and `rejectRequest()`
 * returned the row it had just written - both straight to the owner console.
 */
const approvalRow = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  status: 'PENDING',
  fullName: 'Lerato Mokoena',
  email: 'lerato@haulier.co.za',
  phone: '+27831234567',
  company: 'Mokoena Freight',
  notes: null,
  passwordHash: '$2b$12$pendingadminpasswordhashpendingad',
  companyId: null,
  createdAt: new Date('2026-10-20T08:00:00Z'),
  updatedAt: new Date('2026-10-20T08:00:00Z'),
  ...over,
});

/** OwnerService has eight constructor dependencies; the two under test are enough. */
const makeService = (prisma: Record<string, any>, audit: Record<string, any>) => {
  const svc = Object.create(OwnerService.prototype) as OwnerService;
  (svc as any).prisma = prisma;
  (svc as any).audit = audit;
  return svc;
};

const OWNER_ACTOR = { id: 'own1', email: 'owner@flowops.co.za' } as any;

describe('OwnerService approval requests keep the stored password hash server-side', () => {
  it('getApprovalRequests lists requests without the password hash', async () => {
    const findMany = jest.fn().mockResolvedValue([
      approvalRow(),
      approvalRow({ id: 'req-2', status: 'REJECTED', company: 'Another Haulier' }),
    ]);
    const svc = makeService({ approvalRequest: { findMany } }, { record: jest.fn() });

    const rows = (await svc.getApprovalRequests()) as unknown as Record<string, unknown>[];

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('passwordHash');
      // The console still gets everything it renders.
      expect(row.fullName).toBeTruthy();
      expect(row.email).toBeTruthy();
      expect(row.company).toBeTruthy();
      expect(row.status).toBeTruthy();
      expect(row.createdAt).toBeInstanceOf(Date);
    }
  });

  it('getApprovalRequests still filters by status', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService({ approvalRequest: { findMany } }, { record: jest.fn() });

    await svc.getApprovalRequests({ status: 'PENDING' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('rejectRequest returns the rejected row without the password hash and still audits', async () => {
    const update = jest.fn().mockResolvedValue(approvalRow({ status: 'REJECTED', notes: 'not a fit' }));
    const record = jest.fn().mockResolvedValue(undefined);
    const svc = makeService({ approvalRequest: { update } }, { record });

    const res = (await svc.rejectRequest('req-1', 'not a fit', OWNER_ACTOR)) as unknown as Record<string, unknown>;

    expect(res).not.toHaveProperty('passwordHash');
    expect(res.id).toBe('req-1');
    expect(res.status).toBe('REJECTED');
    expect(res.notes).toBe('not a fit');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'request.reject',
        actorId: 'own1',
        targetId: 'req-1',
        targetName: 'Mokoena Freight',
        metadata: { reason: 'not a fit' },
      }),
    );
  });

  it('approval still reads the hash from Prisma, so redaction cannot break onboarding', () => {
    /**
     * `approveRequest` needs the stored hash to create the tenant admin. It reads
     * its own row straight from Prisma; the redaction above is response-side
     * only. Pin that direction so a future change to the listing cannot quietly
     * take the hash away from onboarding.
     */
    const source = fs.readFileSync(path.join(__dirname, 'owner.service.ts'), 'utf8');
    expect(source).toMatch(
      /const req = await this\.prisma\.approvalRequest\.findUniqueOrThrow\(\{ where: \{ id: requestId \} \}\);/,
    );
    expect(source).toMatch(/if \(req\.passwordHash\) \{/);
  });
});
