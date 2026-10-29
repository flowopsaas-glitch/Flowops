import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TruckAppointmentsPanel from "./TruckAppointmentsPanel";
import { WINDOW_CHANGE_DENIED_HINT } from "../../lib/railWindowAuthority";
import type {
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
    shareToken: null,
    shareLink: null,
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
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ shareToken: "tok_legacy", shareLink: legacyLink })]);
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
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ shareToken: "tok_legacy", shareLink: legacyLink })]);
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
    apiMocks.listTruckAppointments.mockResolvedValue([appt({ shareToken: "tok_legacy", shareLink: legacyLink })]);
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
        shareToken: "t1",
        shareLink: shareLink({ state: "EXPIRED", canAcknowledge: false, expiresAt: "2026-10-20T06:00:00.000Z" }),
      }),
      appt({ id: "a2", vehicleReg: "BBB 222", shareToken: "t2", shareLink: shareLink({ expiresAt: "2026-11-04T06:00:00.000Z" }) }),
      appt({ id: "a3", vehicleReg: "CCC 333", shareToken: null, shareLink: null }),
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
