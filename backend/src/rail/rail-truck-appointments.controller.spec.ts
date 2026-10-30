/**
 * Assigning a driver is two facts, not one: the appointment records who is
 * driving, and the open window change records who has been told. The services
 * that own those facts are separate, so the route that joins them is tested
 * here — with doubles, because the subject is the orchestration, not the writes
 * (those are covered by the two service suites).
 *
 * What must not happen, and what these cases pin down:
 *   - an assignment that leaves the open change addressed to DRIVER:UNASSIGNED,
 *     so the driver sees a new window, presses confirm, and is refused as
 *     NOT_A_RECIPIENT while the board still says nobody is assigned;
 *   - a failure to attach being hidden behind a success response, or being
 *     answered by rolling back an assignment the terminal actually made.
 */
import { UserRole } from '@prisma/client';
import { RailTruckAppointmentsController } from './rail-truck-appointments.controller';

const USER = {
  id: 'u1', email: 'ops@terminal.co.za', name: 'Ops', role: UserRole.MANAGER, companyId: 'c1',
} as any;

function makeController(over: {
  assigned?: Record<string, any>;
  attachment?: Record<string, any>;
  attachThrows?: Error;
} = {}) {
  const assigned = {
    id: 'a1', companyId: 'c1', terminalName: 'Central Terminal', haulierName: 'Haulier Co',
    vehicleReg: 'ABC 123', status: 'BOOKED', driverId: 'd9', driverName: 'Thabo Mokoena',
    ...over.assigned,
  };
  const appointments = { assignDriver: jest.fn(async () => assigned) };
  const attachment = {
    attached: true, reason: 'ATTACHED', changeId: 'ch1', version: 2,
    closedRecipientKeys: ['DRIVER:UNASSIGNED'],
    recipient: { deliveryState: 'PUBLISHED', deliveryReason: null, ackState: 'UNACKED', toldAt: '2026-10-30T05:00:00.000Z' },
    message: 'Thabo Mokoena was added to the open v2 change and told over the driver portal.',
    ...over.attachment,
  };
  const changes = {
    attachDriverToActiveWindow: over.attachThrows
      ? jest.fn(async () => { throw over.attachThrows; })
      : jest.fn(async () => attachment),
  };
  const controller = new RailTruckAppointmentsController(appointments as any, changes as any);
  return { controller, appointments, changes, assigned, attachment };
}

describe('POST /rail/truck-appointments/:id/assign-driver', () => {
  it('assigns the driver and attaches them to the open change, returning what actually happened', async () => {
    const { controller, appointments, changes, attachment } = makeController();

    const res = await controller.assignDriver(USER, 'a1', { driverId: 'd9' });

    expect(appointments.assignDriver).toHaveBeenCalledWith('c1', 'a1', 'd9');
    expect(changes.attachDriverToActiveWindow).toHaveBeenCalledWith({
      companyId: 'c1',
      appointmentId: 'a1',
      // The resolved driver from the appointment record — never a name the
      // caller typed, which is a claim rather than a lookup.
      driver: { id: 'd9', name: 'Thabo Mokoena' },
      actor: USER,
    });
    expect(res).toMatchObject({ id: 'a1', driverId: 'd9', driverAttachment: attachment });
  });

  it('reports NO_ACTIVE_CHANGE rather than implying a notification went out', async () => {
    const { controller } = makeController({
      attachment: {
        attached: false, reason: 'NO_ACTIVE_CHANGE', changeId: null, version: null,
        closedRecipientKeys: [], recipient: null,
        message: 'No window change is open on this appointment. The next one will be addressed to this driver.',
      },
    });

    const res = await controller.assignDriver(USER, 'a1', { driverId: 'd9' });

    expect(res.driverAttachment.attached).toBe(false);
    expect(res.driverAttachment.recipient).toBeNull();
    // The assignment itself still happened and is still returned.
    expect(res.driverId).toBe('d9');
  });

  it('keeps the assignment when the attachment fails, and says so in the server\'s own words', async () => {
    const { controller, appointments } = makeController({
      attachThrows: new Error('That driver is not the driver assigned to this appointment'),
    });

    const res = await controller.assignDriver(USER, 'a1', { driverId: 'd9' });

    // Not rolled back: the driver IS assigned, and pretending otherwise would
    // be worse than reporting the half that did not happen.
    expect(appointments.assignDriver).toHaveBeenCalledTimes(1);
    expect(res.driverId).toBe('d9');
    expect(res.driverAttachment).toMatchObject({ attached: false, reason: 'ATTACH_FAILED', recipient: null });
    expect(res.driverAttachment.message).toMatch(/The driver is assigned, but was not attached/);
    expect(res.driverAttachment.message).toMatch(/not the driver assigned to this appointment/);
  });

  it('falls back to the driver id when the record carries no resolved name', async () => {
    const { controller, changes } = makeController({ assigned: { driverName: null } });

    await controller.assignDriver(USER, 'a1', { driverId: 'd9' });

    expect(changes.attachDriverToActiveWindow).toHaveBeenCalledWith(
      expect.objectContaining({ driver: { id: 'd9', name: 'd9' } }),
    );
  });
});
