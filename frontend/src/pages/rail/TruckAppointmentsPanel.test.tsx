import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TruckAppointmentsPanel from "./TruckAppointmentsPanel";
import { WINDOW_CHANGE_DENIED_HINT } from "../../lib/railWindowAuthority";
import type {
  DriverAttachment,
  ShareLinkState,
  TruckAppointment,
  TruckAppointmentSummary,
} from "../../api/railTruckAppointmentsApi";

/**
 * The terminal's gate-booking panel, tested for the two things an operator can
 * get wrong without noticing:
 *
 *  1. WHO MAY MOVE A PUBLISHED WINDOW. Inside one tenant sit both the terminal's
 *     supervisors and the haulier's dispatch desk, so "can write rail data" is
 *     not the rule. A dispatcher may record what happened at the gate and confirm
 *     a change, but may not re-time the terminal's window — and the panel says so
 *     instead of offering a control the server would refuse.
 *  2. WHICH LINKS ARE STILL ALIVE. A link issued before expiry enforcement never
 *     expires and can only be ended by revocation, so the operator has to see
 *     those rows and be able to kill-and-reissue one in a single click.
 *
 * Everything here is behaviour at the boundary: what is enabled, what is sent,
 * and in what order. The role list itself is asserted by the backend authority
 * spec, not duplicated here.
 */

const apiMocks = vi.hoisted(() => ({
  listTruckAppointments: vi.fn(),
  listAssignableDrivers: vi.fn(),
  getTruckAppointmentSummary: vi.fn(),
  bookTruckAppointment: vi.fn(),
  transitionTruckAppointment: vi.fn(),
  assignTruckDriver: vi.fn(),
  createTruckShareLink: vi.fn(),
  revokeTruckShareLink: vi.fn(),
  replanTruckDay: vi.fn(),
}));

vi.mock("../../api/railTruckAppointmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/railTruckAppointmentsApi")>();
  return { ...actual, ...apiMocks };
});

const authMocks = vi.hoisted(() => ({
  user: { role: "MANAGER", email: "ops@terminal.co.za", companyId: "c1" } as { role: string; email: string; companyId: string } | null,
}));
vi.mock("../../contexts/auth-context", () => ({ useAuth: () => authMocks }));

const toastMocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../../components/toast-context", () => ({ useToast: () => toastMocks }));

// The board has its own test file; here it is a placeholder so its fetches and
// socket subscriptions do not become this panel's business.
vi.mock("./TruckWindowAckBoard", () => ({
  default: () => <div data-testid="ack-board-placeholder" />,
}));

const summary: TruckAppointmentSummary = {
  total: 1,
  byStatus: { BOOKED: 1 },
  measuredWaits: 0,
  avgWaitMinutes: null,
  changeCutoffHours: 2,
};

function appt(over: Partial<TruckAppointment> = {}): TruckAppointment {
  return {
    id: "appt_1",
    terminalName: "Central Terminal",
    haulierName: "Lapo Logistics",
    vehicleReg: "ABC 123",
    purpose: "DELIVERY",
    windowStart: "2026-10-30T06:00:00.000Z",
    windowEnd: "2026-10-30T08:00:00.000Z",
    status: "BOOKED",
    windowVersion: 1,
    // The default row is the real default: a window booked before the driver
    // was known, so the driver half of the loop is off until somebody assigns
    // one. Every test below starts from that and says what it means.
    driverId: null,
    driverName: null,
    // No `shareToken` field: the server does not send one in a row any more, so
    // a fixture carrying one would test against a payload that cannot occur.
    // The link's state is the row's truth.
    shareLink: null,
    ...over,
  };
}

/**
 * What the server reports an assignment did to the change that was already open.
 * The panel's wording is driven by this, so each case below is a real response
 * shape rather than a message the component invented.
 */
function attachment(over: Partial<DriverAttachment> = {}): DriverAttachment {
  return {
    attached: true,
    reason: "ATTACHED",
    changeId: "chg-1",
    version: 3,
    closedRecipientKeys: ["DRIVER:UNASSIGNED"],
    recipient: {
      deliveryState: "PUBLISHED", deliveryReason: null, ackState: "UNACKED",
      toldAt: "2026-10-30T05:00:00.000Z",
    },
    message: "Thabo Mokoena was added to the open v3 change and told over the driver portal.",
    ...over,
  };
}

function shareLink(over: Partial<ShareLinkState> = {}): ShareLinkState {
  return {
    state: "VALID",
    legacy: false,
    canAcknowledge: true,
    issuedAt: "2026-10-28T06:00:00.000Z",
    expiresAt: "2026-11-04T06:00:00.000Z",
    warning: null,
    ...over,
  };
}

const legacyLink = shareLink({
  state: "LEGACY_NO_EXPIRY",
  legacy: true,
  canAcknowledge: false,
  issuedAt: null,
  expiresAt: null,
  warning: "Issued before expiry enforcement — readable forever until revoked",
});

function renderPanel(canWrite = true) {
  return render(<TruckAppointmentsPanel canWrite={canWrite} />);
}

/** The table row for a registration, scoped to the table so banners cannot match. */
async function rowFor(reg: string): Promise<HTMLTableRowElement> {
  const table = await screen.findByRole("table");
  const cell = within(table).getByText(new RegExp(reg));
  return cell.closest("tr") as HTMLTableRowElement;
}

/** A Banner's container: role="status", title plus body. */
function bannerOf(title: string | RegExp): HTMLElement {
  const found = screen.getByText(title).closest('[role="status"]') as HTMLElement | null;
  if (!found) throw new Error(`no banner for ${String(title)}`);
  return found;
}

beforeEach(() => {
  Object.values(apiMocks).forEach((m) => m.mockReset());
  toastMocks.showToast.mockReset();
  authMocks.user = { role: "MANAGER", email: "ops@terminal.co.za", companyId: "c1" };
  apiMocks.listTruckAppointments.mockResolvedValue([appt()]);
  apiMocks.listAssignableDrivers.mockResolvedValue([
    { id: "d1", name: "Thabo Mokoena", isActive: true },
    { id: "d2", name: "Sipho Dlamini", isActive: true },
  ]);
  apiMocks.assignTruckDriver.mockResolvedValue({
    id: "appt_1", driverId: "d1", driverName: "Thabo Mokoena", driverAttachment: attachment(),
  });
  apiMocks.getTruckAppointmentSummary.mockResolvedValue(summary);
  apiMocks.transitionTruckAppointment.mockResolvedValue({ id: "appt_1" });
  apiMocks.createTruckShareLink.mockResolvedValue({ token: "tok_new", path: "/gate/tok_new" });
  apiMocks.revokeTruckShareLink.mockResolvedValue({ revoked: true });
  apiMocks.replanTruckDay.mockResolvedValue({
    terminalName: "Central Terminal",
    date: "2026-10-30",
    shiftMinutes: 120,
    reason: "Train ETA slipped 2h",
    shifted: 1,
    withConflicts: 0,
    appointmentIds: ["appt_1"],
    skipped: [],
  });
});

describe("who may move a published window", () => {
  it("a terminal manager with rail write can reschedule, and sees the day replan", async () => {
    renderPanel();

    expect(await screen.findByRole("button", { name: "Reschedule" })).toBeEnabled();
    expect(screen.getByLabelText("Replan terminal")).toBeInTheDocument();
    expect(screen.queryByText("You can confirm changes but not move windows")).not.toBeInTheDocument();
  });

  it("a dispatcher can confirm but not move a window: the control is disabled and says why", async () => {
    authMocks.user = { role: "DISPATCH", email: "dispatch@haulier.co.za", companyId: "c1" };
    renderPanel();

    const reschedule = await screen.findByRole("button", { name: "Reschedule" });
    expect(reschedule).toBeDisabled();
    expect(reschedule).toHaveAttribute("title", WINDOW_CHANGE_DENIED_HINT);

    expect(bannerOf("You can confirm changes but not move windows")).toHaveTextContent(WINDOW_CHANGE_DENIED_HINT);
    // No day replan either — a whole day is a bigger window move, not a smaller one.
    expect(screen.queryByLabelText("Replan terminal")).not.toBeInTheDocument();
  });

  it("a dispatcher can still record what happened at the gate", async () => {
    authMocks.user = { role: "DISPATCH", email: "dispatch@haulier.co.za", companyId: "c1" };
    renderPanel();

    const actions = within(await rowFor("ABC 123"));
    expect(actions.getByRole("button", { name: "Arrived" })).toBeEnabled();
    expect(actions.getByRole("button", { name: "No-show" })).toBeEnabled();
    // Cancelling a BOOKED window publishes a change, so it needs the same authority.
    expect(actions.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(actions.getByRole("button", { name: "Cancel" })).toHaveAttribute("title", WINDOW_CHANGE_DENIED_HINT);
    expect(
      actions.getByText("Cancelling a booked window also needs the window-change permission"),
    ).toBeInTheDocument();
  });

  it("a read-only user gets no controls at all", async () => {
    authMocks.user = { role: "VIEWER", email: "viewer@terminal.co.za", companyId: "c1" };
    // The parent decides canWrite; a viewer never gets it.
    renderPanel(false);

    expect(await screen.findByRole("button", { name: /Refresh/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reschedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share link" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Replan terminal")).not.toBeInTheDocument();
    expect(screen.queryByText("You can confirm changes but not move windows")).not.toBeInTheDocument();
  });

  it("a disabled control asks the server for nothing", async () => {
    authMocks.user = { role: "DISPATCH", email: "dispatch@haulier.co.za", companyId: "c1" };
    renderPanel();

    const actions = within(await rowFor("ABC 123"));
    fireEvent.click(actions.getByRole("button", { name: "Reschedule" }));
    fireEvent.click(actions.getByRole("button", { name: "Cancel" }));

    expect(apiMocks.transitionTruckAppointment).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New window start")).not.toBeInTheDocument();
    expect(toastMocks.showToast).not.toHaveBeenCalled();
  });

  it("a forced change inside the cut-off is refused in the UI until a reason is recorded", async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    fireEvent.change(await screen.findByLabelText("New window start"), { target: { value: "2026-10-30T10:00" } });
    fireEvent.change(screen.getByLabelText("New window end"), { target: { value: "2026-10-30T12:00" } });
    fireEvent.click(screen.getByLabelText("Force change inside cut-off"));
    fireEvent.click(screen.getByRole("button", { name: "Apply new window" }));

    expect(toastMocks.showToast).toHaveBeenCalledWith(
      "A forced change inside the cut-off needs a recorded reason.",
      "error",
    );
    expect(apiMocks.transitionTruckAppointment).not.toHaveBeenCalled();
  });

  it("publishing a new window is keyed against a double submit, and the toast says who was told", async () => {
    apiMocks.transitionTruckAppointment.mockResolvedValue({
      id: "appt_1",
      change: { version: 2, recipients: [{ recipientType: "DRIVER", driverId: "d1" }, { recipientType: "HAULIER" }] },
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    fireEvent.change(await screen.findByLabelText("New window start"), { target: { value: "2026-10-30T10:00" } });
    fireEvent.change(screen.getByLabelText("New window end"), { target: { value: "2026-10-30T12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply new window" }));

    await waitFor(() => expect(apiMocks.transitionTruckAppointment).toHaveBeenCalledTimes(1));
    const [id, action, dto, key] = apiMocks.transitionTruckAppointment.mock.calls[0];
    expect(id).toBe("appt_1");
    expect(action).toBe("reschedule");
    expect(key).toBe("reschedule:appt_1:2026-10-30T10:00:2026-10-30T12:00");
    // The wall-clock values are what the operator typed, in the browser's zone.
    expect(new Date(dto.windowStart).getTime()).toBe(new Date("2026-10-30T10:00").getTime());
    expect(new Date(dto.windowEnd).getTime()).toBe(new Date("2026-10-30T12:00").getTime());
    expect(dto).not.toHaveProperty("force");

    await waitFor(() => expect(toastMocks.showToast).toHaveBeenCalledTimes(1));
    const [message, tone] = toastMocks.showToast.mock.calls[0];
    expect(message).toMatch(/Window changed \(v2\)/);
    expect(message).toMatch(/superseded/);
    expect(message).toMatch(/the haulier and the assigned driver were notified/);
    expect(tone).toBe("success");
  });

  it("a day replan is keyed from the request, so a double submit cannot shift the day twice", async () => {
    renderPanel();

    fireEvent.change(await screen.findByLabelText("Replan terminal"), { target: { value: "Central Terminal" } });
    fireEvent.change(screen.getByLabelText("Replan date"), { target: { value: "2026-10-30" } });
    fireEvent.change(screen.getByLabelText("Replan reason"), { target: { value: "Train ETA slipped 2h" } });
    fireEvent.click(screen.getByRole("button", { name: /Shift day's bookings/ }));

    await waitFor(() => expect(apiMocks.replanTruckDay).toHaveBeenCalledTimes(1));
    expect(apiMocks.replanTruckDay).toHaveBeenCalledWith(
      { terminalName: "Central Terminal", date: "2026-10-30", shiftMinutes: 120, reason: "Train ETA slipped 2h" },
      "replan:Central Terminal:2026-10-30:120:Train ETA slipped 2h",
    );
  });

  it("windows a replan refused to move are named, so a part-replanned day cannot look like a whole one", async () => {
    apiMocks.replanTruckDay.mockResolvedValue({
      terminalName: "Central Terminal",
      date: "2026-10-30",
      shiftMinutes: 120,
      reason: "Train ETA slipped 2h",
      shifted: 1,
      withConflicts: 0,
      appointmentIds: ["appt_1"],
      skipped: [{ appointmentId: "appt_2", vehicleReg: "DEF 456", reason: "WINDOW_CLOSED" }],
    });
    renderPanel();

    fireEvent.change(await screen.findByLabelText("Replan terminal"), { target: { value: "Central Terminal" } });
    fireEvent.change(screen.getByLabelText("Replan date"), { target: { value: "2026-10-30" } });
    fireEvent.change(screen.getByLabelText("Replan reason"), { target: { value: "Train ETA slipped 2h" } });
    fireEvent.click(screen.getByRole("button", { name: /Shift day's bookings/ }));

    expect(await screen.findByText("Some windows were NOT moved by the day replan")).toBeInTheDocument();
    expect(bannerOf("Some windows were NOT moved by the day replan")).toHaveTextContent("DEF 456 — WINDOW_CLOSED");
    expect(bannerOf("Some windows were NOT moved by the day replan")).toHaveTextContent(
      "A day that was only partly replanned must not look like a whole day",
    );
    expect(toastMocks.showToast.mock.calls[0][0]).toMatch(/1 NOT moved: DEF 456/);
  });
});

describe("share links the operator has to be able to see", () => {
  it("flags a legacy link on its row and across the tenant, with what to do about it", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ shareLink: legacyLink })]);
    renderPanel();

    const actions = within(await rowFor("ABC 123"));
    expect(actions.getByText("LEGACY LINK — never expires, cannot confirm")).toBeInTheDocument();
    expect(actions.getByRole("button", { name: "Revoke & re-issue" })).toBeEnabled();

    const banner = bannerOf("1 legacy share link — no expiry on record");
    expect(banner).toHaveTextContent("ABC 123 · Lapo Logistics · Central Terminal");
    expect(banner).toHaveTextContent("They stay readable until somebody revokes them");
    expect(banner).toHaveTextContent("can no longer be used to confirm a window change");
  });

  it("re-issuing revokes first and then creates, and says when the new link expires", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ shareLink: legacyLink })]);
    apiMocks.createTruckShareLink.mockResolvedValue({
      token: "tok_new",
      path: "/gate/tok_new",
      expiresAt: "2026-11-05T06:00:00.000Z",
    });
    renderPanel();

    fireEvent.click(within(await rowFor("ABC 123")).getByRole("button", { name: "Revoke & re-issue" }));

    await waitFor(() => expect(apiMocks.createTruckShareLink).toHaveBeenCalledTimes(1));
    expect(apiMocks.revokeTruckShareLink).toHaveBeenCalledTimes(1);
    // Order matters: re-issuing before revoking would leave the old link alive.
    expect(apiMocks.revokeTruckShareLink.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.createTruckShareLink.mock.invocationCallOrder[0],
    );
    const message = toastMocks.showToast.mock.calls[0][0];
    expect(message).toMatch(/Old link revoked and a new one issued/);
    expect(message).toContain(new Date("2026-11-05T06:00:00.000Z").toLocaleString());
    expect(message).toMatch(/the old one no longer works/);
  });

  it("a failed revocation issues nothing: the old link is not left alive beside a new one", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ shareLink: legacyLink })]);
    apiMocks.revokeTruckShareLink.mockRejectedValue(new Error("revocation refused"));
    renderPanel();

    fireEvent.click(within(await rowFor("ABC 123")).getByRole("button", { name: "Revoke & re-issue" }));

    await waitFor(() => expect(toastMocks.showToast).toHaveBeenCalledWith("revocation refused", "error"));
    expect(apiMocks.createTruckShareLink).not.toHaveBeenCalled();
  });

  it("an expired link says it expired, a valid link shows its expiry, and no link offers to create one", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([
      appt({
        id: "a1",
        vehicleReg: "AAA 111",
        shareLink: shareLink({ state: "EXPIRED", canAcknowledge: false, expiresAt: "2026-10-20T06:00:00.000Z" }),
      }),
      appt({ id: "a2", vehicleReg: "BBB 222", shareLink: shareLink({ expiresAt: "2026-11-04T06:00:00.000Z" }) }),
      appt({ id: "a3", vehicleReg: "CCC 333", shareLink: null }),
    ]);
    renderPanel();

    expect(await screen.findByText("Link expired — re-issue if they still need the window")).toBeInTheDocument();
    expect(
      screen.getByText(`Link expires ${new Date("2026-11-04T06:00:00.000Z").toLocaleDateString()}`),
    ).toBeInTheDocument();

    const unshared = within(await rowFor("CCC 333"));
    expect(unshared.getByRole("button", { name: "Share link" })).toBeEnabled();
    expect(unshared.queryByText(/LEGACY LINK/)).not.toBeInTheDocument();

    fireEvent.click(unshared.getByRole("button", { name: "Share link" }));
    await waitFor(() => expect(apiMocks.createTruckShareLink).toHaveBeenCalledWith("a3"));
  });

  it("the revoke/share choice comes from the link state, not from a token in the payload", async () => {
    // The server no longer sends `shareToken` in a row. A token is a bearer
    // credential — it reads the appointment and confirms a window change with no
    // login — and this list is served to every rail read role including the
    // read-only one, so the row says whether a link exists by STATE instead.
    apiMocks.listTruckAppointments.mockResolvedValue([
      appt({ id: "b1", vehicleReg: "DDD 444", shareLink: shareLink() }),
      appt({
        id: "b2",
        vehicleReg: "EEE 555",
        shareLink: shareLink({ state: "ABSENT", canAcknowledge: false, issuedAt: null, expiresAt: null }),
      }),
    ]);
    renderPanel();

    const linked = within(await rowFor("DDD 444"));
    expect(linked.getByRole("button", { name: "Revoke link" })).toBeEnabled();
    expect(linked.queryByRole("button", { name: "Share link" })).not.toBeInTheDocument();

    const none = within(await rowFor("EEE 555"));
    expect(none.getByRole("button", { name: "Share link" })).toBeEnabled();
    expect(none.queryByRole("button", { name: "Revoke link" })).not.toBeInTheDocument();

    // Revoking targets the appointment id: the UI never needed the credential.
    fireEvent.click(linked.getByRole("button", { name: "Revoke link" }));
    await waitFor(() => expect(apiMocks.revokeTruckShareLink).toHaveBeenCalledWith("b1"));
  });
});

describe("assigning the driver who will actually drive", () => {
  const picker = async (reg = "ABC 123") => {
    const r = await rowFor(reg);
    return within(r).getByLabelText(`Assign a FlowOps driver to ${reg}`);
  };

  it("offers the tenant's active drivers, and says what an empty choice means", async () => {
    renderPanel();

    const select = await picker();
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Not assigned — the portal cannot confirm", "Thabo Mokoena", "Sipho Dlamini"]);
  });

  it("assigning tells the appointment, reloads, and says what it turns on", async () => {
    renderPanel();

    fireEvent.change(await picker(), { target: { value: "d1" } });

    await waitFor(() => expect(apiMocks.assignTruckDriver).toHaveBeenCalledWith("appt_1", "d1"));
    const [message, tone] = toastMocks.showToast.mock.calls[0];
    expect(message).toMatch(/Thabo Mokoena assigned to ABC 123/);
    // The open change is the thing the terminal needs to hear about.
    expect(message).toMatch(/added to the open v3 window change/);
    expect(message).toMatch(/driver portal/);
    // The haulier's confirmation and the driver's are separate states.
    expect(message).toMatch(/separately from the haulier's/);
    // Their deadline runs from the assignment, not from a change published earlier.
    expect(message).toMatch(/clock started at this assignment/);
    expect(tone).toBe("success");
    await waitFor(() => expect(apiMocks.listTruckAppointments).toHaveBeenCalledTimes(2));
  });

  it("when no change is open it says there was nothing to attach — it does not claim a notification", async () => {
    apiMocks.assignTruckDriver.mockResolvedValue({
      id: "appt_1", driverId: "d1", driverName: "Thabo Mokoena",
      driverAttachment: attachment({
        attached: false, reason: "NO_ACTIVE_CHANGE", changeId: null, version: null,
        closedRecipientKeys: [], recipient: null,
        message: "No window change is open on this appointment. The next one will be addressed to this driver.",
      }),
    });
    renderPanel();

    fireEvent.change(await picker(), { target: { value: "d1" } });

    const [message, tone] = await waitFor(() => {
      expect(toastMocks.showToast).toHaveBeenCalled();
      return toastMocks.showToast.mock.calls[0];
    });
    expect(message).toMatch(/No window change is open/);
    expect(message).toMatch(/next one will reach them in the driver portal/);
    expect(message).not.toMatch(/were added to the open/);
    expect(tone).toBe("success");
  });

  it("when the attachment fails, the assignment is still reported and the failure is an error", async () => {
    // The server DID record the assignment; only the attachment failed. The list
    // the panel reloads therefore shows the driver, and the row is not rolled
    // back to look as though nothing happened.
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ driverId: "d1", driverName: "Thabo Mokoena" })]);
    apiMocks.assignTruckDriver.mockResolvedValue({
      id: "appt_1", driverId: "d1", driverName: "Thabo Mokoena",
      driverAttachment: attachment({
        attached: false, reason: "ATTACH_FAILED", changeId: null, version: null,
        closedRecipientKeys: [], recipient: null,
        message: "The driver is assigned, but was not attached to an open window change: connection reset",
      }),
    });
    renderPanel();

    fireEvent.change(await picker(), { target: { value: "d1" } });

    const [message, tone] = await waitFor(() => {
      expect(toastMocks.showToast).toHaveBeenCalled();
      return toastMocks.showToast.mock.calls[0];
    });
    // Both halves: the driver IS assigned, the change is NOT addressed to them.
    expect(message).toMatch(/Thabo Mokoena assigned to ABC 123/);
    expect(message).toMatch(/were NOT attached to an open window change/);
    expect(message).toMatch(/connection reset/);
    expect(tone).toBe("error");
    // The row still shows the assignment: the list was reloaded from the server.
    expect(await picker()).toHaveValue("d1");
  });

  it("replacing a driver says who was taken off the change", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ driverId: "d1", driverName: "Thabo Mokoena" })]);
    apiMocks.assignTruckDriver.mockResolvedValue({
      id: "appt_1", driverId: "d2", driverName: "Sipho Dlamini",
      driverAttachment: attachment({
        version: 2, closedRecipientKeys: ["DRIVER:d1"],
        message: "Sipho Dlamini was added to the open v2 change and told over the driver portal.",
      }),
    });
    renderPanel();

    fireEvent.change(await picker(), { target: { value: "d2" } });

    const message = await waitFor(() => {
      expect(toastMocks.showToast).toHaveBeenCalled();
      return toastMocks.showToast.mock.calls[0][0];
    });
    expect(message).toMatch(/Sipho Dlamini assigned to ABC 123/);
    expect(message).toMatch(/previous driver was taken off the change \(DRIVER:d1\)/);
  });

  it("a driver who had already confirmed is reported as having confirmed", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ driverId: "d1", driverName: "Thabo Mokoena" })]);
    apiMocks.assignTruckDriver.mockResolvedValue({
      id: "appt_1", driverId: "d1", driverName: "Thabo Mokoena",
      driverAttachment: attachment({
        attached: false, reason: "ALREADY_ACKNOWLEDGED", closedRecipientKeys: [], recipient: null,
        message: "This driver had already confirmed v3.",
      }),
    });
    renderPanel();

    fireEvent.change(await picker(), { target: { value: "d1" } });

    const message = await waitFor(() => {
      expect(toastMocks.showToast).toHaveBeenCalled();
      return toastMocks.showToast.mock.calls[0][0];
    });
    expect(message).toMatch(/had already confirmed the open v3 window change/);
  });

  it("a dispatcher may assign a driver — that is not moving a window", async () => {
    authMocks.user = { role: "DISPATCH", email: "dispatch@haulier.co.za", companyId: "c1" };
    renderPanel();

    expect(await picker()).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeDisabled();
  });

  it("choosing not-assigned over an assigned driver explains instead of pretending", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ driverId: "d1", driverName: "Thabo Mokoena" })]);
    renderPanel();

    const select = await picker();
    expect(select).toHaveValue("d1");
    fireEvent.change(select, { target: { value: "" } });

    expect(apiMocks.assignTruckDriver).not.toHaveBeenCalled();
    expect(toastMocks.showToast.mock.calls[0][0]).toMatch(/cannot be unassigned from here/);
    expect(toastMocks.showToast.mock.calls[0][1]).toBe("info");
    // Still assigned: the control is driven by the record, not by the click.
    expect(select).toHaveValue("d1");
  });

  it("an assigned driver who has gone inactive is still shown as the assigned driver", async () => {
    apiMocks.listAssignableDrivers.mockResolvedValue([{ id: "d2", name: "Sipho Dlamini", isActive: true }]);
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ driverId: "d1", driverName: "Thabo Mokoena" })]);
    renderPanel();

    const select = await picker();
    expect(select).toHaveValue("d1");
    expect(within(select).getByRole("option", { name: "Thabo Mokoena (not active)" })).toBeInTheDocument();
  });

  it("when the driver list cannot be read, the picker says so instead of looking empty", async () => {
    apiMocks.listAssignableDrivers.mockRejectedValue(new Error("forbidden"));
    renderPanel();

    const select = await picker();
    expect(select).toBeDisabled();
    expect(select.closest("label")).toHaveAttribute("title", "Driver list unavailable: forbidden");
    // The gate board still works — the driver list is an addition, not a dependency.
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("a refused assignment shows the server's words and leaves the row as it was", async () => {
    apiMocks.assignTruckDriver.mockRejectedValue(new Error("That driver is not an active driver in your company"));
    renderPanel();

    fireEvent.change(await picker(), { target: { value: "d2" } });

    await waitFor(() =>
      expect(toastMocks.showToast).toHaveBeenCalledWith("That driver is not an active driver in your company", "error"),
    );
    expect((await picker())).toHaveValue("");
  });

  it("says on the row whether the portal can confirm", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([
      appt({ id: "a1", vehicleReg: "AAA 111", driverId: "d1", driverName: "Thabo Mokoena" }),
      appt({ id: "a2", vehicleReg: "BBB 222", driverId: null, driverName: "Someone's own driver" }),
      appt({ id: "a3", vehicleReg: "CCC 333", driverId: null, driverName: null }),
    ]);
    renderPanel();

    expect(await screen.findByText(/driver Thabo Mokoena · the portal can confirm/)).toBeInTheDocument();
    expect(
      screen.getByText(/Someone's own driver is not a FlowOps driver — the portal cannot confirm/),
    ).toBeInTheDocument();
    expect(screen.getByText(/no FlowOps driver — the portal cannot confirm a change/)).toBeInTheDocument();
  });

  it("offers no picker once the truck has been dealt with", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ status: "COMPLETED" })]);
    renderPanel();

    await screen.findByRole("table");
    expect(screen.queryByLabelText("Assign a FlowOps driver to ABC 123")).not.toBeInTheDocument();
  });

  it("booking can assign the driver in the same submit", async () => {
    apiMocks.bookTruckAppointment.mockResolvedValue({ id: "appt_9" });
    renderPanel();

    fireEvent.change(await screen.findByLabelText("Terminal name"), { target: { value: "Central Terminal" } });
    fireEvent.change(screen.getByLabelText("Haulier name"), { target: { value: "Lapo Logistics" } });
    fireEvent.change(screen.getByLabelText("Vehicle registration"), { target: { value: "XYZ 999" } });
    fireEvent.change(screen.getByLabelText("Window start"), { target: { value: "2026-10-30T10:00" } });
    fireEvent.change(screen.getByLabelText("Window end"), { target: { value: "2026-10-30T12:00" } });
    fireEvent.change(screen.getByLabelText("Assigned FlowOps driver"), { target: { value: "d2" } });
    fireEvent.change(screen.getByLabelText("Driver name"), { target: { value: "Relief driver" } });
    fireEvent.click(screen.getByRole("button", { name: /Book window/ }));

    await waitFor(() => expect(apiMocks.bookTruckAppointment).toHaveBeenCalledTimes(1));
    const dto = apiMocks.bookTruckAppointment.mock.calls[0][0];
    expect(dto.driverId).toBe("d2");
    // The free-text name is kept as a label; it is not what makes a channel.
    expect(dto.driverName).toBe("Relief driver");
    expect(new Date(dto.windowStart).getTime()).toBe(new Date("2026-10-30T10:00").getTime());
  });
});

describe("loading, empty and unavailable", () => {
  it("an empty day says so instead of rendering an empty table", async () => {
    apiMocks.listTruckAppointments.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText(/No truck appointments yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("a failed load says no conclusion can be drawn", async () => {
    apiMocks.listTruckAppointments.mockRejectedValue(new Error("gateway timeout"));
    renderPanel();

    await screen.findByText("Truck appointments unavailable");
    const banner = bannerOf("Truck appointments unavailable");
    expect(banner).toHaveTextContent("gateway timeout");
    expect(banner).toHaveTextContent("No conclusion about gate bookings can be drawn");
  });

  it("states the cut-off rule when the terminal has one, because it decides whether a reason is required", async () => {
    renderPanel();

    expect(
      await screen.findByText(/Window changes inside 2h of the window start must be forced with a recorded reason/),
    ).toBeInTheDocument();
  });
});
