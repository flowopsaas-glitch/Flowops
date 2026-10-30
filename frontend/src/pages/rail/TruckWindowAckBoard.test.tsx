import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TruckWindowAckBoard from "./TruckWindowAckBoard";
import type { WindowAckBoard, WindowChange, WindowKpis, WindowRecipient } from "../../api/railTruckAppointmentsApi";

/**
 * The terminal's acknowledgement board — "does that truck know?"
 *
 * These tests are about the claims the board makes, because every one of them
 * is read by somebody deciding whether to hold a truck:
 *   - the haulier and the driver are separate lines with separate states;
 *   - a recipient nobody could reach is never counted as "has not confirmed";
 *   - a superseded window stays visible and struck through;
 *   - every figure carries n, a denominator, a source and a freshness, and an
 *     absent measurement reads UNKNOWN rather than 0;
 *   - and the board refreshes by polling even when no socket is connected, which
 *     is the fallback a terminal on a flaky link actually relies on.
 */

const apiMocks = vi.hoisted(() => ({
  getWindowAckBoard: vi.fn(),
  getWindowKpis: vi.fn(),
  ackWindowChange: vi.fn(),
}));

vi.mock("../../api/railTruckAppointmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/railTruckAppointmentsApi")>();
  return { ...actual, ...apiMocks };
});

const authMocks = vi.hoisted(() => ({
  user: { role: "MANAGER", email: "ops@terminal.co.za", companyId: "c1" } as
    | { role: string; email: string; companyId: string }
    | null,
}));
vi.mock("../../contexts/auth-context", () => ({ useAuth: () => authMocks }));

const toastMocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../../components/toast-context", () => ({ useToast: () => toastMocks }));

const socketMocks = vi.hoisted(() => ({
  handlers: {} as Record<string, () => void>,
  socket: {
    on: vi.fn((event: string, fn: () => void) => { socketMocks.handlers[event] = fn; }),
    off: vi.fn((event: string) => { delete socketMocks.handlers[event]; }),
  },
  isConnected: true,
}));
vi.mock("../../hooks/useSocket", () => ({
  useSocket: () => ({ socket: socketMocks.socket, isConnected: socketMocks.isConnected }),
}));

const iso = (minsFromNow: number) => new Date(Date.now() + minsFromNow * 60_000).toISOString();

function recipient(over: Partial<WindowRecipient> & { recipientType: WindowRecipient["recipientType"] }): WindowRecipient {
  const isDriver = over.recipientType === "DRIVER";
  return {
    id: isDriver ? "rec-driver" : "rec-haulier",
    recipientLabel: isDriver ? "Thabo Mokoena" : "Haulier Co",
    driverId: isDriver ? "d1" : null,
    delivery: {
      channels: isDriver ? ["DRIVER_PORTAL", "PUSH"] : ["SHARE_LINK", "REALTIME", "IN_APP", "WEBHOOK"],
      state: "DELIVERED",
      reason: null,
      detail: [],
      dispatchedAt: iso(-25),
      deliveredAt: iso(-25),
    },
    ack: {
      state: "UNACKED", ackedAt: null, ackDeviceAt: null, source: null, byLabel: null,
      latencyMinutes: null, latencyFromToldMinutes: null,
    },
    escalation: {
      stage: "NONE", ackDueMinutes: 30, minutesSinceChange: 25, minutesUntilDue: 5,
      overdue: false, reminderDue: false, escalationDue: false, sinceChange: "25 min",
      // The default recipient was addressable when the change was published, so
      // both clocks are the same clock.
      toldAt: iso(-25), attachedAfterChange: false, minutesSinceTold: 25, sinceTold: "25 min",
    },
    ...over,
  } as WindowRecipient;
}

function change(over: Partial<WindowChange> = {}): WindowChange {
  return {
    id: "chg-1",
    appointmentId: "appt-1",
    version: 2,
    changeKind: "RESCHEDULED",
    status: "ACTIVE",
    previousWindow: { start: iso(180), end: iso(240), text: "2026-10-30 06:00–08:00 UTC" },
    newWindow: { start: iso(300), end: iso(360), text: "2026-10-30 08:00–10:00 UTC" },
    reason: "Crane breakdown at the terminal",
    forced: false,
    insideCutoff: false,
    cutoffHours: 2,
    truckStatusAtChange: "BOOKED",
    windowAlreadyClosed: false,
    changedAt: iso(-25),
    changedBy: { id: "u1", email: "ops@terminal.co.za", role: "MANAGER" },
    supersededAt: null,
    appointment: {
      id: "appt-1", terminalName: "Central Terminal", haulierName: "Haulier Co", vehicleReg: "ABC 123",
      driverName: "Thabo Mokoena", driverId: "d1", status: "BOOKED",
      windowStart: iso(300), windowEnd: iso(360), windowVersion: 2, arrivedAt: null,
    },
    recipients: [recipient({ recipientType: "HAULIER" }), recipient({ recipientType: "DRIVER" })],
    ...over,
  } as WindowChange;
}

function board(rows: WindowChange[], counts: Partial<WindowAckBoard["counts"]> = {}): WindowAckBoard {
  return {
    terminalName: null,
    computedAt: new Date().toISOString(),
    source: "terminal_truck_window_changes + terminal_truck_window_recipients (this tenant)",
    method: "A recipient with no deliverable channel is counted in `unreachable` and excluded from the others.",
    changes: rows.length,
    counts: {
      acknowledged: 0, unacknowledged: 2, stale: 0, escalated: 0, reminderDue: 0,
      driverNotAssigned: 0, unreachable: 0, ...counts,
    },
    rows,
  };
}

function kpis(over: Partial<WindowKpis> = {}): WindowKpis {
  return {
    computedAt: new Date().toISOString(),
    window: { from: null, to: null },
    changesExamined: 4,
    driverNotAssignedChanges: 1,
    recipientsAttachedAfterChange: 0,
    source: "terminal_truck_window_changes + terminal_truck_window_recipients (this tenant only)",
    method: "change→ack latency uses server-observed ackedAt minus changedAt; device-reported times are excluded from measurement.",
    ackLatency: {
      medianMinutes: 12, p90Minutes: 40, n: 3, minMinutes: 4, maxMinutes: 40,
      medianText: "12 min", p90Text: "40 min",
      byRecipientType: {
        HAULIER: { medianMinutes: 8, p90Minutes: 20, n: 2, minMinutes: 4, maxMinutes: 20, medianText: "8 min", p90Text: "20 min" },
        DRIVER: { medianMinutes: 40, p90Minutes: 40, n: 1, minMinutes: 40, maxMinutes: 40, medianText: "40 min", p90Text: "40 min" },
      },
      // Nobody was attached late in this fixture, so told→ack equals change→ack.
      fromTold: {
        medianMinutes: 12, p90Minutes: 40, n: 3, minMinutes: 4, maxMinutes: 40, medianText: "12 min", p90Text: "40 min",
        definition: "server-observed ackedAt minus the moment this recipient became addressable.",
      },
    },
    ackRate: {
      HAULIER: { acknowledged: 2, notAcknowledged: 1, denominator: 3, unreachable: 0, driverNotAssigned: 0, percent: 66.7, percentText: "66.7%" },
      DRIVER: { acknowledged: 1, notAcknowledged: 1, denominator: 2, unreachable: 1, driverNotAssigned: 1, percent: 50, percentText: "50%" },
      definition: "acknowledged / reachable recipients of this type. A recipient with no channel is excluded, not failed.",
    },
    ackedBeforeArrival: {
      ackedBeforeArrival: 2, ackedAfterArrival: 1, neverAcked: 1, denominator: 4,
      excludedNoArrival: 3, excludedUnreachable: 1, percent: 50, percentText: "50%",
      definition: "A change counts as acknowledged before arrival when its EARLIEST recipient acknowledgement is at or before the TERMINAL-RECORDED arrival time.",
      arrivalSource: "terminal_truck_appointments.arrivedAt — a TERMINAL-RECORDED arrival; not GPS and not a geofence.",
    },
    staleUnackedChanges: 2,
    unreachableRecipients: 1,
    ...over,
  } as WindowKpis;
}

// A test killed mid-await under fake timers would leave them installed for the
// rest of the file, which is how one bad test times out every test after it.
afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  apiMocks.getWindowAckBoard.mockReset();
  apiMocks.getWindowKpis.mockReset();
  apiMocks.ackWindowChange.mockReset();
  toastMocks.showToast.mockReset();
  socketMocks.handlers = {};
  socketMocks.isConnected = true;
  authMocks.user = { role: "MANAGER", email: "ops@terminal.co.za", companyId: "c1" };
});

describe("the board answers \"does that truck know?\"", () => {
  it("shows the NEW window prominently, the superseded one struck through, and the reason", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const next = await screen.findByText("2026-10-30 08:00–10:00 UTC");
    expect(next).toBeInTheDocument();
    // The old window is still on the record, semantically deleted.
    const old = screen.getByText("2026-10-30 06:00–08:00 UTC");
    expect(old.tagName).toBe("DEL");
    expect(screen.getByText(/Crane breakdown at the terminal/)).toBeInTheDocument();
    expect(screen.getByText(/v2/)).toBeInTheDocument();
    expect(screen.getByText(/ABC 123/)).toBeInTheDocument();
  });

  it("keeps the haulier and the driver on SEPARATE lines with separate states", async () => {
    const row = change({
      recipients: [
        recipient({
          recipientType: "HAULIER",
          ack: { state: "ACKNOWLEDGED", ackedAt: iso(-20), ackDeviceAt: null, source: "TENANT_USER", byLabel: "dispatch@haulier.co.za", latencyMinutes: 5, latencyFromToldMinutes: 5 },
        }),
        recipient({ recipientType: "DRIVER" }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(board([row], { acknowledged: 1, unacknowledged: 1 }));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const lines = within(list).getAllByRole("listitem");
    expect(lines).toHaveLength(2);
    expect(within(lines[0]).getByText("Haulier:")).toBeInTheDocument();
    expect(within(lines[0]).getByText("Confirmed")).toBeInTheDocument();
    expect(within(lines[0]).getByText(/after 5 min/)).toBeInTheDocument();
    expect(within(lines[0]).getByText(/via tenant user/)).toBeInTheDocument();
    // A dispatcher confirming does not mean the truck knows.
    expect(within(lines[1]).getByText("Driver:")).toBeInTheDocument();
    expect(within(lines[1]).getByText("Not confirmed yet")).toBeInTheDocument();
    expect(within(lines[1]).queryByText("Confirmed")).not.toBeInTheDocument();
  });

  it("shows a device-reported time as the device's claim, labelled, next to the server time", async () => {
    const row = change({
      recipients: [
        recipient({
          recipientType: "DRIVER",
          ack: {
            state: "ACKNOWLEDGED", ackedAt: "2026-10-29T04:00:00.000Z", ackDeviceAt: "2026-10-29T01:30:00.000Z",
            source: "DRIVER_PORTAL", byLabel: "Thabo Mokoena", latencyMinutes: 150, latencyFromToldMinutes: 150,
          },
        }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(board([row], { acknowledged: 1, unacknowledged: 0 }));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const deviceLine = within(list).getByText(/^device-reported/i);
    expect(deviceLine).toHaveTextContent(new Date("2026-10-29T01:30:00.000Z").toLocaleString());
    expect(deviceLine.getAttribute("title")).toMatch(/server-observed time/i);
    // The method line says the measurement ignores it — both statements at once.
    expect(screen.getByText(/device-reported times are excluded from measurement/)).toBeInTheDocument();
  });

  it("a recipient nobody could reach is reported, never counted as \"has not confirmed\"", async () => {
    const row = change({
      recipients: [
        recipient({ recipientType: "HAULIER" }),
        recipient({
          recipientType: "DRIVER",
          recipientLabel: "DRIVER NOT ASSIGNED",
          driverId: null,
          delivery: { channels: ["NONE"], state: "UNAVAILABLE", reason: "DRIVER_NOT_ASSIGNED", detail: [], dispatchedAt: null, deliveredAt: null },
          escalation: {
            stage: "NONE", ackDueMinutes: 30, minutesSinceChange: 120, minutesUntilDue: -90,
            overdue: false, reminderDue: false, escalationDue: false, sinceChange: "2 h",
            toldAt: iso(-120), attachedAfterChange: false, minutesSinceTold: 120, sinceTold: "2 h",
          },
        }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(
      board([row], { unacknowledged: 1, driverNotAssigned: 1, unreachable: 1 }),
    );
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const driverLine = within(list).getAllByRole("listitem")[1];
    expect(within(driverLine).getByText("DRIVER NOT ASSIGNED")).toBeInTheDocument();
    expect(within(driverLine).getByText("Cannot confirm — not reachable")).toBeInTheDocument();
    expect(within(driverLine).queryByText("Not confirmed yet")).not.toBeInTheDocument();
    expect(within(driverLine).queryByText(/ESCALATED/)).not.toBeInTheDocument();
    // The counts say the same thing the rows do.
    expect(screen.getByText("Not confirmed 1")).toBeInTheDocument();
    expect(screen.getByText("Not reachable 1")).toBeInTheDocument();
    expect(screen.getByText("Driver not assigned 1")).toBeInTheDocument();
    // ...and the payload explains how they were built.
    expect(screen.getByText(/counted in `unreachable` and excluded/)).toBeInTheDocument();
  });

  it("shows the ladder: a reminder sent, and an escalation to the terminal and dispatcher", async () => {
    const row = change({
      recipients: [
        recipient({
          recipientType: "HAULIER",
          escalation: {
            stage: "ESCALATED", ackDueMinutes: 30, minutesSinceChange: 95, minutesUntilDue: -65,
            overdue: true, reminderDue: false, escalationDue: true, sinceChange: "1 h 35 min",
            toldAt: iso(-95), attachedAfterChange: false, minutesSinceTold: 95, sinceTold: "1 h 35 min",
          },
        }),
        recipient({
          recipientType: "DRIVER",
          escalation: {
            stage: "REMINDER", ackDueMinutes: 30, minutesSinceChange: 40, minutesUntilDue: -10,
            overdue: true, reminderDue: true, escalationDue: false, sinceChange: "40 min",
            toldAt: iso(-40), attachedAfterChange: false, minutesSinceTold: 40, sinceTold: "40 min",
          },
        }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(
      board([row], { unacknowledged: 2, stale: 2, escalated: 1, reminderDue: 1 }),
    );
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const lines = within(list).getAllByRole("listitem");
    expect(within(lines[0]).getByText("ESCALATED — not confirmed")).toBeInTheDocument();
    expect(within(lines[1]).getByText("Reminder sent — not confirmed")).toBeInTheDocument();
    expect(screen.getByText("Overdue 2")).toBeInTheDocument();
    expect(screen.getByText("Escalated 1")).toBeInTheDocument();
    const truckRow = list.closest("tr") as HTMLElement;
    expect(within(truckRow).getByRole("cell", { name: /1 h 35 min since change/ })).toBeInTheDocument();
    expect(within(truckRow).getByRole("cell", { name: /ops@terminal\.co\.za/ })).toBeInTheDocument();
  });

  it("a cancelled window says there is no replacement instead of showing a time", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change({ changeKind: "CANCELLED", newWindow: null })]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);
    expect(await screen.findByText("No new window — cancelled")).toBeInTheDocument();
    expect(screen.getByText(/Cancelled/)).toBeInTheDocument();
  });
});

describe("every figure carries its n, denominator, source and freshness", () => {
  it("reports median and P90 with n, split by recipient type", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    expect(await screen.findByText(/median 12 min · P90 40 min/)).toBeInTheDocument();
    expect(screen.getByText("n=3 acknowledgements")).toBeInTheDocument();
    expect(screen.getByText(/Haulier n=2 \(median 8 min\)/)).toBeInTheDocument();
    expect(screen.getByText(/Driver n=1 \(median 40 min\)/)).toBeInTheDocument();
  });

  it("labels the arrival figure as terminal-recorded, with its denominator and exclusions", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    expect(await screen.findByText("Confirmed before the truck arrived")).toBeInTheDocument();
    expect(screen.getByText("(terminal-recorded arrival)")).toBeInTheDocument();
    expect(screen.getByText("2 of 4 changes with a terminal-recorded arrival")).toBeInTheDocument();
    expect(screen.getByText(/Excluded: 3 no arrival recorded · 1 nobody reachable/)).toBeInTheDocument();
    expect(screen.getByText(/1 confirmed after arrival · 1 never confirmed/)).toBeInTheDocument();
    // The source line names the field and says what it is not.
    expect(screen.getByText(/a TERMINAL-RECORDED arrival; not GPS and not a geofence/)).toBeInTheDocument();
  });

  it("shows the ack rate per recipient type with reachable denominators and the excluded count", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    expect(await screen.findByText(/Haulier organisation: 66\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/Assigned driver: 50%/)).toBeInTheDocument();
    expect(screen.getByText(/2 confirmed of 3 reachable · 1 not confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/1 confirmed of 2 reachable · 1 not confirmed · 1 excluded \(no channel\) · 1 DRIVER NOT ASSIGNED/)).toBeInTheDocument();
    expect(screen.getByText(/A recipient with no channel is excluded, not failed/)).toBeInTheDocument();
  });

  it("reads UNKNOWN when the driver denominator is empty — a missing assignment is not a 0% rate", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis({
      ackRate: {
        HAULIER: { acknowledged: 1, notAcknowledged: 0, denominator: 1, unreachable: 0, driverNotAssigned: 0, percent: 100, percentText: "100%" },
        DRIVER: { acknowledged: 0, notAcknowledged: 0, denominator: 0, unreachable: 2, driverNotAssigned: 2, percent: null, percentText: "UNKNOWN" },
        definition: "acknowledged / reachable recipients of this type. A recipient with no channel is excluded, not failed.",
      },
      driverNotAssignedChanges: 2,
      recipientsAttachedAfterChange: 0,
      ackLatency: {
        medianMinutes: 8, p90Minutes: 8, n: 1, minMinutes: 8, maxMinutes: 8, medianText: "8 min", p90Text: "8 min",
        byRecipientType: {
          HAULIER: { medianMinutes: 8, p90Minutes: 8, n: 1, minMinutes: 8, maxMinutes: 8, medianText: "8 min", p90Text: "8 min" },
          DRIVER: { medianMinutes: null, p90Minutes: null, n: 0, minMinutes: null, maxMinutes: null, medianText: "UNKNOWN", p90Text: "UNKNOWN" },
        },
        fromTold: {
          medianMinutes: 8, p90Minutes: 8, n: 1, minMinutes: 8, maxMinutes: 8, medianText: "8 min", p90Text: "8 min",
          definition: "server-observed ackedAt minus the moment this recipient became addressable.",
        },
      },
    }));
    render(<TruckWindowAckBoard canWrite />);

    expect(await screen.findByText(/Assigned driver: UNKNOWN/)).toBeInTheDocument();
    expect(screen.getByText(/0 confirmed of 0 reachable · 0 not confirmed · 2 excluded \(no channel\) · 2 DRIVER NOT ASSIGNED/)).toBeInTheDocument();
    expect(screen.getByText(/Driver n=0 \(median UNKNOWN\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 with no driver assigned/)).toBeInTheDocument();
  });

  it("states source, method and freshness, and that a missing figure is UNKNOWN never zero", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);
    expect(await screen.findByText(/A missing figure is UNKNOWN, never zero/)).toBeInTheDocument();
    expect(screen.getByText(/this tenant only/)).toBeInTheDocument();
    expect(screen.getByText(/device-reported times are excluded from measurement/)).toBeInTheDocument();
    expect(screen.getByText(/Updated /)).toBeInTheDocument();
  });
});

describe("honest empty, loading and error states", () => {
  it("says so while loading", async () => {
    apiMocks.getWindowAckBoard.mockReturnValue(new Promise(() => undefined));
    apiMocks.getWindowKpis.mockReturnValue(new Promise(() => undefined));
    render(<TruckWindowAckBoard canWrite />);
    expect(await screen.findByRole("status")).toHaveTextContent(/Loading acknowledgements/);
  });

  it("says when nothing is in force, rather than showing an empty table", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis({ changesExamined: 0 }));
    render(<TruckWindowAckBoard canWrite />);
    expect(await screen.findByText(/No window change is currently in force/)).toBeInTheDocument();
    expect(screen.getByText(/nothing is waiting on a confirmation right now/)).toBeInTheDocument();
  });

  it("reports an unavailable board and refuses to let anybody conclude anything from it", async () => {
    apiMocks.getWindowAckBoard.mockRejectedValue(new Error("timeout of 30000ms exceeded"));
    apiMocks.getWindowKpis.mockRejectedValue(new Error("timeout of 30000ms exceeded"));
    render(<TruckWindowAckBoard canWrite />);
    expect(await screen.findByText("Acknowledgement board unavailable")).toBeInTheDocument();
    expect(screen.getByText(/nothing can be concluded about which changes have been confirmed/)).toBeInTheDocument();
  });

  it("flags data that is ageing instead of presenting itself as live", async () => {
    vi.useFakeTimers();
    try {
      apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
      apiMocks.getWindowKpis.mockResolvedValue(kpis());
      render(<TruckWindowAckBoard canWrite />);
      await vi.advanceTimersByTimeAsync(0);
      expect(screen.queryByText(/DATA AGEING/)).not.toBeInTheDocument();
      // The 20s poll failing five times leaves the board 100 seconds old.
      apiMocks.getWindowAckBoard.mockRejectedValue(new Error("still down"));
      apiMocks.getWindowKpis.mockRejectedValue(new Error("still down"));
      await vi.advanceTimersByTimeAsync(100_000);
      expect(screen.getByText("This board is ageing")).toBeInTheDocument();
      expect(screen.getByText(/DATA AGEING/)).toBeInTheDocument();
      // The last-known rows stay on screen: a failed background refresh must not
      // wipe a board the terminal is reading — but it must not look current.
      expect(screen.getByLabelText("Acknowledgement state for ABC 123")).toBeInTheDocument();
      expect(screen.getByText(/the refresh since then has failed: still down/)).toBeInTheDocument();
      expect(screen.queryByText("Acknowledgement board unavailable")).not.toBeInTheDocument();
      expect(screen.getByText(/treat the confirmation states as UNKNOWN until it reloads/i)).toBeInTheDocument();
      // The last good rows are still on screen: a failed refresh does not wipe
      // what the terminal was reading.
      expect(screen.getByText("2026-10-30 08:00–10:00 UTC")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("refresh paths", () => {
  it("polls every 20 seconds even with no socket connected", async () => {
    vi.useFakeTimers();
    try {
      socketMocks.isConnected = false;
      apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
      apiMocks.getWindowKpis.mockResolvedValue(kpis());
      render(<TruckWindowAckBoard canWrite />);
      await vi.advanceTimersByTimeAsync(0);
      expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/polling only/)).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(20_000);
      expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes immediately when the socket says a window changed or was confirmed", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);
    await waitFor(() => expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/· live$/)).toBeInTheDocument();

    expect(socketMocks.socket.on).toHaveBeenCalledWith("truck-window-changed", expect.any(Function));
    expect(socketMocks.socket.on).toHaveBeenCalledWith("truck-window-acknowledged", expect.any(Function));

    fireEvent.click(screen.getByRole("button", { name: "Refresh acknowledgement board" }));
    await waitFor(() => expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(2));

    socketMocks.handlers["truck-window-acknowledged"]?.();
    await waitFor(() => expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(3));
  });

  it("stops listening once the board is unmounted", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    const view = render(<TruckWindowAckBoard canWrite />);
    await waitFor(() => expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(1));

    view.unmount();
    expect(socketMocks.socket.off).toHaveBeenCalledWith("truck-window-changed", expect.any(Function));
    expect(socketMocks.socket.off).toHaveBeenCalledWith("truck-window-acknowledged", expect.any(Function));
    expect(socketMocks.handlers["truck-window-changed"]).toBeUndefined();
    expect(socketMocks.handlers["truck-window-acknowledged"]).toBeUndefined();
  });

  it("never invents a socket: without one the board says it is polling only", async () => {
    socketMocks.isConnected = false;
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);
    await waitFor(() => expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/polling only/)).toBeInTheDocument();
    expect(screen.queryByText(/· live$/)).not.toBeInTheDocument();
  });
});

describe("confirming from the board", () => {
  it("confirms for the haulier with an idempotency key and reloads", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()], { unacknowledged: 2 }));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    apiMocks.ackWindowChange.mockResolvedValue({ idempotentReplay: false, recipient: {}, change: {} });
    render(<TruckWindowAckBoard canWrite />);

    const button = await screen.findByRole("button", { name: "Confirm this window change on behalf of Haulier Co" });
    fireEvent.click(button);

    await waitFor(() => expect(apiMocks.ackWindowChange).toHaveBeenCalledTimes(1));
    expect(apiMocks.ackWindowChange).toHaveBeenCalledWith("chg-1", { idempotencyKey: "ack:chg-1:rec-haulier" });
    expect(toastMocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("The driver's confirmation is tracked separately"),
      "success",
    );
    await waitFor(() => expect(apiMocks.getWindowAckBoard).toHaveBeenCalledTimes(2));
  });

  it("says so when the server replays an earlier confirmation instead of recording a second one", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    apiMocks.ackWindowChange.mockResolvedValue({ idempotentReplay: true, recipient: {}, change: {} });
    render(<TruckWindowAckBoard canWrite />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm this window change on behalf of Haulier Co" }));
    await waitFor(() => expect(toastMocks.showToast).toHaveBeenCalledWith(
      "Already confirmed — the original confirmation stands.",
      "success",
    ));
  });

  it("offers no confirm control to a read-only user", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite={false} />);
    await screen.findByText("2026-10-30 08:00–10:00 UTC");
    expect(screen.queryByRole("button", { name: /Confirm this window change/ })).not.toBeInTheDocument();
  });

  it("never offers to confirm on the driver's behalf — that confirmation is the driver's own", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);
    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const driverLine = within(list).getAllByRole("listitem")[1];
    expect(within(driverLine).queryByRole("button")).not.toBeInTheDocument();
  });

  it("surfaces a refused confirmation instead of implying it worked", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    apiMocks.ackWindowChange.mockRejectedValue(new Error("That window version was superseded by a newer change"));
    render(<TruckWindowAckBoard canWrite />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirm this window change on behalf of Haulier Co" }));
    await waitFor(() => expect(toastMocks.showToast).toHaveBeenCalledWith(
      "That window version was superseded by a newer change",
      "error",
    ));
  });
  // ── A driver attached after the change was published ───────────────────────
  //
  // Assignment can happen after a window has already moved. The driver then
  // becomes a recipient of a change that is older than the moment they were
  // told, and the board has to show both facts without letting one of them
  // blame the wrong person.

  it("shows a late-attached driver the time they have had, not the age of the change", async () => {
    const row = change({
      recipients: [
        recipient({
          recipientType: "HAULIER",
          escalation: {
            stage: "ESCALATED", ackDueMinutes: 30, minutesSinceChange: 190, minutesUntilDue: -160,
            overdue: true, reminderDue: false, escalationDue: true, sinceChange: "3 h 10 min",
            toldAt: iso(-190), attachedAfterChange: false, minutesSinceTold: 190, sinceTold: "3 h 10 min",
          },
        }),
        recipient({
          recipientType: "DRIVER",
          escalation: {
            stage: "NONE", ackDueMinutes: 30, minutesSinceChange: 190, minutesUntilDue: 20,
            overdue: false, reminderDue: false, escalationDue: false, sinceChange: "3 h 10 min",
            toldAt: iso(-10), attachedAfterChange: true, minutesSinceTold: 10, sinceTold: "10 min",
          },
        }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(board([row], { unacknowledged: 1, escalated: 1 }));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const [haulierLine, driverLine] = within(list).getAllByRole("listitem");
    expect(within(haulierLine).getByText(/ESCALATED — not confirmed/)).toBeInTheDocument();
    // The driver has had ten minutes, and the board says so next to a change
    // that is three hours old.
    const told = within(driverLine).getByText(/told 10 min ago · assigned after the change/);
    expect(told).toBeInTheDocument();
    expect(told.getAttribute("title")).toMatch(/deadline runs from that moment/i);
    expect(within(driverLine).getByText("Not confirmed yet")).toBeInTheDocument();
    expect(within(driverLine).queryByText(/ESCALATED/)).not.toBeInTheDocument();
    expect(within(driverLine).queryByText(/Reminder sent/)).not.toBeInTheDocument();
  });

  it("a placeholder closed by an assignment says what happened instead of DRIVER NOT ASSIGNED", async () => {
    const row = change({
      recipients: [
        recipient({ recipientType: "HAULIER" }),
        recipient({
          recipientType: "DRIVER",
          recipientLabel: "No driver was assigned when this changed",
          driverId: null,
          delivery: {
            channels: ["NONE"], state: "UNAVAILABLE", reason: "DRIVER_ASSIGNED_LATER",
            detail: [], dispatchedAt: null, deliveredAt: null,
          },
        }),
        recipient({ recipientType: "DRIVER", id: "rec-driver-2", driverId: "d1" }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(board([row], { unacknowledged: 2, unreachable: 1 }));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const closedLine = within(list).getAllByRole("listitem")[1];
    expect(within(closedLine).getByText("No driver was assigned when this changed")).toBeInTheDocument();
    expect(within(closedLine).getByText("Unavailable — a driver was assigned after this change")).toBeInTheDocument();
    // The row that used to read as an open absence no longer does.
    expect(within(list).queryByText("DRIVER NOT ASSIGNED")).not.toBeInTheDocument();
    // And the driver who was attached is on their own line, still owed.
    expect(within(list).getAllByRole("listitem")[2]).toHaveTextContent("Thabo Mokoena");
  });

  it("a driver who was replaced is shown as replaced, not as somebody who ignored the change", async () => {
    const row = change({
      recipients: [
        recipient({ recipientType: "HAULIER" }),
        recipient({
          recipientType: "DRIVER",
          recipientLabel: "Sipho Dlamini",
          id: "rec-driver-old",
          driverId: "d2",
          delivery: {
            channels: ["DRIVER_PORTAL"], state: "UNAVAILABLE", reason: "DRIVER_REASSIGNED",
            detail: [], dispatchedAt: iso(-40), deliveredAt: null,
          },
          escalation: {
            stage: "NONE", ackDueMinutes: 30, minutesSinceChange: 60, minutesUntilDue: -30,
            overdue: false, reminderDue: false, escalationDue: false, sinceChange: "1 h",
            toldAt: iso(-60), attachedAfterChange: false, minutesSinceTold: 60, sinceTold: "1 h",
          },
        }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(board([row], { unacknowledged: 1, unreachable: 1 }));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const replaced = within(list).getAllByRole("listitem")[1];
    // Their name stays: they are a real person who really was told.
    expect(within(replaced).getByText("Sipho Dlamini")).toBeInTheDocument();
    expect(within(replaced).getByText("Unavailable — replaced by another driver")).toBeInTheDocument();
    expect(within(replaced).getByText("Cannot confirm — not reachable")).toBeInTheDocument();
    expect(within(replaced).queryByText(/ESCALATED/)).not.toBeInTheDocument();
  });

  it("reports a late confirmation against both clocks", async () => {
    const row = change({
      recipients: [
        recipient({ recipientType: "HAULIER" }),
        recipient({
          recipientType: "DRIVER",
          ack: {
            state: "ACKNOWLEDGED", ackedAt: iso(-4), ackDeviceAt: null, source: "DRIVER_PORTAL",
            byLabel: "Thabo Mokoena", latencyMinutes: 184, latencyFromToldMinutes: 4,
          },
          escalation: {
            stage: "NONE", ackDueMinutes: 30, minutesSinceChange: 190, minutesUntilDue: 0,
            overdue: false, reminderDue: false, escalationDue: false, sinceChange: "3 h 10 min",
            toldAt: iso(-10), attachedAfterChange: true, minutesSinceTold: 10, sinceTold: "10 min",
          },
        }),
      ],
    });
    apiMocks.getWindowAckBoard.mockResolvedValue(board([row], { acknowledged: 1 }));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());
    render(<TruckWindowAckBoard canWrite />);

    const list = await screen.findByLabelText("Acknowledgement state for ABC 123");
    const driverLine = within(list).getAllByRole("listitem")[1];
    // 184 minutes after the window moved; 4 minutes after this driver was told.
    expect(within(driverLine).getByText(/after 184 min · 4 min from being told · via driver portal/)).toBeInTheDocument();
  });

  it("measures from being told beside the headline figure, only when somebody was attached late", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis({
      recipientsAttachedAfterChange: 1,
      ackLatency: {
        medianMinutes: 102, p90Minutes: 184, n: 2, minMinutes: 20, maxMinutes: 184,
        medianText: "1 h 42 min", p90Text: "3 h 4 min",
        byRecipientType: {
          HAULIER: { medianMinutes: 20, p90Minutes: 20, n: 1, minMinutes: 20, maxMinutes: 20, medianText: "20 min", p90Text: "20 min" },
          DRIVER: { medianMinutes: 184, p90Minutes: 184, n: 1, minMinutes: 184, maxMinutes: 184, medianText: "3 h 4 min", p90Text: "3 h 4 min" },
        },
        fromTold: {
          medianMinutes: 12, p90Minutes: 20, n: 2, minMinutes: 4, maxMinutes: 20,
          medianText: "12 min", p90Text: "20 min",
          definition: "server-observed ackedAt minus the moment this recipient became addressable.",
        },
      },
    }));
    render(<TruckWindowAckBoard canWrite />);

    // The headline is still change→ack, unchanged and unblended.
    expect(await screen.findByText(/median 1 h 42 min · P90 3 h 4 min/)).toBeInTheDocument();
    expect(screen.getByText(/Driver n=1 \(median 3 h 4 min\)/)).toBeInTheDocument();
    // ...with the second reading beside it, labelled and with its own n.
    const told = screen.getByText(/1 recipient assigned after the change: measured from when they were told/);
    expect(told).toHaveTextContent("median 12 min");
    expect(told).toHaveTextContent("n=2");
    expect(told.getAttribute("title")).toMatch(/became addressable/);
  });

  it("does not show a told→ack figure when nobody was attached late", async () => {
    apiMocks.getWindowAckBoard.mockResolvedValue(board([change()]));
    apiMocks.getWindowKpis.mockResolvedValue(kpis());   // recipientsAttachedAfterChange: 0
    render(<TruckWindowAckBoard canWrite />);

    expect(await screen.findByText(/median 12 min · P90 40 min/)).toBeInTheDocument();
    expect(screen.queryByText(/assigned after the change: measured from when they were told/)).not.toBeInTheDocument();
  });
});
