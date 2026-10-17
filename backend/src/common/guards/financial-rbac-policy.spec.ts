import 'reflect-metadata';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CollectionsController } from '../../collections/collections.controller';
import { DisbursementsController } from '../../disbursements/disbursements.controller';
import { InvoicesController } from '../../invoices/invoices.controller';

const rolesFor = (controller: any, method: string) => Reflect.getMetadata(ROLES_KEY, controller.prototype[method]);

describe('finance and collection route role policies', () => {
  it('allows viewer reads but never viewer disbursement mutations', () => {
    expect(Reflect.getMetadata(ROLES_KEY, DisbursementsController)).toContain(UserRole.VIEWER);
    for (const method of ['create', 'update', 'recover', 'setStatus', 'remove']) {
      const roles = rolesFor(DisbursementsController, method);
      expect(roles).toContain(UserRole.COMPANY_ADMIN);
      expect(roles).not.toContain(UserRole.VIEWER);
    }
  });

  it('keeps invoice read access separate from finance writes', () => {
    expect(Reflect.getMetadata(ROLES_KEY, InvoicesController)).toContain(UserRole.VIEWER);
    for (const method of ['triggerAutoInvoice', 'create', 'sendReminder', 'update', 'initiatePay', 'markPaid', 'finalizeDraft']) {
      expect(rolesFor(InvoicesController, method)).toEqual([
        UserRole.ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.MANAGER,
      ]);
    }
  });

  it('restricts collection mutations to dispatch-capable roles, not agents or viewers', () => {
    const expected = [UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.MANAGER, UserRole.DISPATCH];
    for (const method of ['create', 'update', 'cancel', 'confirmCollected', 'assignDriver', 'releaseDriver']) {
      const roles = rolesFor(CollectionsController, method);
      expect(roles).toEqual(expected);
      expect(roles).not.toContain(UserRole.AGENT);
      expect(roles).not.toContain(UserRole.VIEWER);
    }
    expect(Reflect.getMetadata(ROLES_KEY, CollectionsController)).toContain(UserRole.AGENT);
    expect(Reflect.getMetadata(ROLES_KEY, CollectionsController)).toContain(UserRole.VIEWER);
  });
});
