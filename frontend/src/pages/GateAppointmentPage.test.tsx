import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import GateAppointmentPage from "./GateAppointmentPage";
import type { SharedTruckAppointment, SharedWindowChange } from "../api/railTruckAppointmentsApi";

/**
 * The counterparty view — what a haulier (or their dispatcher) sees when they
 * open the share link, standing in a yard, on a phone, with no FlowOps login.
 *
 * These tests exist because this page is the only thing between a changed
 * window and a truck that turns up at the wrong time, and because every claim
 * it makes has to be true:
 *   - the NEW window is the first and largest thing, and the superseded one is
 *     struck through semantically, so a screen reader cannot read two plausible
 *     times;
 *   - confirming is ONE large control, and a second tap cannot record a second
 *     confirmation (the idempotency key is derived from the change);
 *   - a refusal is shown in the server's own words and never as success — and
 *     the page then re-reads, so the haulier ends up looking at the version
 *     that is actually in force;
 *   - a link that can be READ but not CONFIRMED (a legacy link with no expiry on
 *     record) says so instead of rendering a button that would be refused;
 *   - a cancelled window tells them not to travel;
 *   - and the page keeps itself current by polling, because a haulier has no
 *     socket of their own.
 */

const apiMocks = vi.hoisted(() => ({
  getSharedTruckAppointment: vi.fn(),
  ackSharedTruckAppointment: vi.fn(),
}));

vi.mock("../api/railTruckAppointmentsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/railTruckAppointmentsApi")>();
  return { ...actual, ...apiMocks };
});

const TOKEN = "tok_share_1";

const iso = (minsFromNow: number) => new Date(Date.now() + minsFromNow * 60_000).toISOString();

function sharedChange(over: Partial<SharedWindowChange> = {}): SharedWindowChange {
  return {
    id: "chg_1",
    version: 2,
    changeKind: "RESCHEDULED",
    changedAt: "2026-10-29T05:00:00.000Z",
    reason: "Crane crew changeover ran long",
    previousWindowText: "2026-10-30 06:00–08:00 UTC",
    previousWindow: { start: "2026-10-30T06:00:00.000Z", end: "2026-10-30T08:00:00.000Z" },
    newWindowText: "2026-10-30 08:00–10:00 UTC",
    newWindow: { start: "2026-10-30T08:00:00.000Z", end: "2026-10-30T10:00:00.000Z" },
    acknowledged: false,
    acknowledgedAt: null,
    ...over,
  };
}

function shared(over: Partial<SharedTruckAppointment> = {}): SharedTruckAppointment {
  return {
    terminalName: "Central Terminal",
    haulierName: "Lapo Logistics",
    vehicleReg: "ABC 123",
    purpose: "IMPORT_PICKUP",
    windowStart: "2026-10-30T08:00:00.000Z",
    windowEnd: "2026-10-30T10:00:00.000Z",
    windowVersion: 2,
    status: "BOOKED",
    link: { expiresAt: iso(60 * 24 * 6), canAcknowledge: true, noExpiryOnRecord: false },
    change: null,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/gate/${TOKEN}`]}>
      <Routes>
        <Route path="/gate/:token" element={<GateAppointmentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const CONFIRM_NAME = /^CONFIRM — I have the new window$/;
const findConfirmButton = () => screen.findByRole("button", { name: CONFIRM_NAME });
const confirmButton = () => screen.getByRole("button", { name: CONFIRM_NAME });

beforeEach(() => {
  apiMocks.getSharedTruckAppointment.mockReset();
  apiMocks.ackSharedTruckAppointment.mockReset();
  apiMocks.getSharedTruckAppointment.mockResolvedValue(shared({ change: sharedChange() }));
  apiMocks.ackSharedTruckAppointment.mockResolvedValue({ idempotentReplay: false });
});

// A test killed mid-await under fake timers would leave them installed for the
// rest of the file, which is how one bad test times out every test after it.
afterEach(() => {
  vi.useRealTimers();
});

describe("the link is the credential", () => {
  it("a link carrying no token is refused instead of spinning forever", async () => {
    render(
      <MemoryRouter initialEntries={["/gate/"]}>
        <GateAppointmentPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/no share token/);
    expect(apiMocks.getSharedTruckAppointment).not.toHaveBeenCalled();
    // Nothing to retry: the URL itself is wrong.
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("the change is the first thing the haulier sees", () => {
  it("shows the new window large, the superseded one struck through, and the reason", async () => {
    renderPage();

    expect(await screen.findByText("Your window has CHANGED · version 2")).toBeInTheDocument();
    expect(screen.getByText("2026-10-30 08:00–10:00 UTC")).toBeInTheDocument();

    const superseded = screen.getByText("2026-10-30 06:00–08:00 UTC");
    // <del>, not just a grey font: a screen reader announces it as deleted.
    expect(superseded.tagName).toBe("DEL");
    expect(superseded.className).toMatch(/line-through/);
    expect(screen.getByText("Previous window — no longer in force")).toBeInTheDocument();

    expect(screen.getByText(/Crane crew changeover ran long/)).toBeInTheDocument();
    expect(screen.getByText(/Published by the terminal/)).toHaveTextContent(
      new Date("2026-10-29T05:00:00.000Z").toLocaleString(),
    );
  });

  it("keeps the appointment it belongs to on the page, with the version number", async () => {
    renderPage();

    expect(await screen.findByText("Truck window · Central Terminal")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your appointment" })).toBeInTheDocument();
    expect(screen.getByText("version 2")).toBeInTheDocument();
    expect(screen.getByText("Lapo Logistics")).toBeInTheDocument();
    expect(screen.getByText("ABC 123")).toBeInTheDocument();
    expect(screen.getByText("Booked")).toBeInTheDocument();
  });

  it("says so when no change has been published, instead of showing an empty box", async () => {
    apiMocks.getSharedTruckAppointment.mockResolvedValue(shared({ change: null, windowVersion: 1 }));
    renderPage();

    expect(await screen.findByText(/No change has been published to this window/)).toBeInTheDocument();
    expect(screen.queryByText(/Your window has CHANGED/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^CONFIRM —/ })).not.toBeInTheDocument();
  });
});

describe("confirming with one hand", () => {
  it("offers exactly one large control, with the consequence explained next to it", async () => {
    renderPage();

    const button = await findConfirmButton();
    expect(button).toHaveAttribute("aria-describedby", "confirm-explainer");
    expect(screen.getByText(/One tap tells the terminal that this change has reached you/)).toBeInTheDocument();
    // Nothing else on the page can confirm — no menus, no second path.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("sends an idempotency key derived from the change, plus the device clock as a labelled claim", async () => {
    renderPage();
    fireEvent.click(await findConfirmButton());

    await waitFor(() => expect(apiMocks.ackSharedTruckAppointment).toHaveBeenCalledTimes(1));
    const [token, opts] = apiMocks.ackSharedTruckAppointment.mock.calls[0];
    expect(token).toBe(TOKEN);
    expect(opts.idempotencyKey).toBe("share-ack:chg_1");
    // A real clock reading, not a constant — and the server measures with its own.
    expect(Math.abs(Date.parse(opts.deviceAckedAt) - Date.now())).toBeLessThan(60_000);
  });

  it("cannot record two confirmations from a double tap", async () => {
    let resolveAck!: (value: unknown) => void;
    apiMocks.ackSharedTruckAppointment.mockImplementation(
      () => new Promise((resolve) => { resolveAck = resolve; }),
    );
    renderPage();

    const button = await findConfirmButton();
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(apiMocks.ackSharedTruckAppointment).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();

    await act(async () => { resolveAck({ idempotentReplay: false }); });
  });

  it("re-reads after confirming and shows whose clock the recorded time is", async () => {
    apiMocks.getSharedTruckAppointment
      .mockResolvedValueOnce(shared({ change: sharedChange() }))
      .mockResolvedValue(
        shared({ change: sharedChange({ acknowledged: true, acknowledgedAt: "2026-10-29T05:12:00.000Z" }) }),
      );
    renderPage();

    fireEvent.click(await findConfirmButton());

    const confirmed = await screen.findByText(/The terminal recorded your confirmation at/);
    expect(confirmed).toHaveTextContent(new Date("2026-10-29T05:12:00.000Z").toLocaleString());
    expect(confirmed).toHaveTextContent(/If the window changes again/);
    expect(screen.queryByRole("button", { name: /^CONFIRM —/ })).not.toBeInTheDocument();
    expect(apiMocks.getSharedTruckAppointment).toHaveBeenCalledTimes(2);
  });

  it("shows an already-confirmed change as confirmed, with no button to press again", async () => {
    apiMocks.getSharedTruckAppointment.mockResolvedValue(
      shared({ change: sharedChange({ acknowledged: true, acknowledgedAt: "2026-10-29T05:12:00.000Z" }) }),
    );
    renderPage();

    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^CONFIRM —/ })).not.toBeInTheDocument();
    expect(apiMocks.ackSharedTruckAppointment).not.toHaveBeenCalled();
  });
});

describe("a refusal is shown in the server's words, never as success", () => {
  it("409 SUPERSEDED: shows the refusal, then the window that is actually in force", async () => {
    apiMocks.getSharedTruckAppointment
      .mockResolvedValueOnce(shared({ change: sharedChange() }))
      .mockResolvedValue(
        shared({
          windowVersion: 3,
          change: sharedChange({
            id: "chg_2",
            version: 3,
            previousWindowText: "2026-10-30 08:00–10:00 UTC",
            newWindowText: "2026-10-30 10:00–12:00 UTC",
            newWindow: { start: "2026-10-30T10:00:00.000Z", end: "2026-10-30T12:00:00.000Z" },
          }),
        }),
      );
    apiMocks.ackSharedTruckAppointment.mockRejectedValue(
      new Error("SUPERSEDED — version 2 is no longer in force; confirm version 3 instead"),
    );
    renderPage();

    fireEvent.click(await findConfirmButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("SUPERSEDED");
    expect(alert).toHaveTextContent("confirm version 3 instead");
    // Never a success state, and never a recorded confirmation time.
    expect(screen.queryByText(/The terminal recorded your confirmation/)).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();

    // The page re-read: the window they were told to use is now the struck-through one.
    expect(await screen.findByText("Your window has CHANGED · version 3")).toBeInTheDocument();
    expect(screen.getByText("2026-10-30 08:00–10:00 UTC").tagName).toBe("DEL");
    expect(screen.getByText("2026-10-30 10:00–12:00 UTC")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it("a legacy link with no expiry on record can be read but offers no confirm control", async () => {
    apiMocks.getSharedTruckAppointment.mockResolvedValue(
      shared({ change: sharedChange(), link: { expiresAt: null, canAcknowledge: false, noExpiryOnRecord: true } }),
    );
    renderPage();

    expect(await screen.findByText("You cannot confirm from this link")).toBeInTheDocument();
    expect(screen.getByText(/issued before FlowOps enforced link expiry/)).toHaveTextContent(
      /Ask the terminal operator to re-share the appointment/,
    );
    expect(screen.queryByRole("button", { name: /^CONFIRM —/ })).not.toBeInTheDocument();
    // Still readable — the haulier is not left with nothing.
    expect(screen.getByText("2026-10-30 08:00–10:00 UTC")).toBeInTheDocument();
    expect(screen.getByText(/This link has no expiry recorded/)).toBeInTheDocument();
  });

  it("an expired link that is not legacy gets the plain wording, not the legacy explanation", async () => {
    apiMocks.getSharedTruckAppointment.mockResolvedValue(
      shared({
        change: sharedChange(),
        link: { expiresAt: "2026-10-20T00:00:00.000Z", canAcknowledge: false, noExpiryOnRecord: false },
      }),
    );
    renderPage();

    expect(await screen.findByText("You cannot confirm from this link")).toBeInTheDocument();
    expect(screen.getByText(/This link can no longer be used to confirm a change/)).toBeInTheDocument();
    expect(screen.queryByText(/issued before FlowOps enforced link expiry/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^CONFIRM —/ })).not.toBeInTheDocument();
  });
});

describe("an unusable link", () => {
  it("shows the server's own reason and says the booking itself is unaffected", async () => {
    apiMocks.getSharedTruckAppointment.mockRejectedValue(
      new Error("This share link was revoked by the terminal operator"),
    );
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("heading", { name: "This link cannot be used" })).toBeInTheDocument();
    expect(alert).toHaveTextContent("This share link was revoked by the terminal operator");
    expect(alert).toHaveTextContent(/your booking itself is unaffected/);
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^CONFIRM —/ })).not.toBeInTheDocument();
  });

  it("recovers when a retry succeeds", async () => {
    apiMocks.getSharedTruckAppointment
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValue(shared({ change: sharedChange() }));
    renderPage();

    fireEvent.click((await screen.findByRole("button", { name: "Try again" })));

    expect(await screen.findByText("Your window has CHANGED · version 2")).toBeInTheDocument();
    expect(apiMocks.getSharedTruckAppointment).toHaveBeenCalledTimes(2);
  });
});

describe("a cancellation", () => {
  it("tells the haulier not to travel, and shows no replacement time", async () => {
    apiMocks.getSharedTruckAppointment.mockResolvedValue(
      shared({
        windowVersion: 3,
        status: "CANCELLED",
        change: sharedChange({ changeKind: "CANCELLED", version: 3, newWindow: null, newWindowText: null }),
      }),
    );
    renderPage();

    expect(await screen.findByText("Your window was cancelled · version 3")).toBeInTheDocument();
    expect(screen.getByText("No replacement window — do not travel to the terminal")).toBeInTheDocument();
    expect(screen.queryByText(/UNKNOWN — ask the terminal/)).not.toBeInTheDocument();
    expect(screen.getByText("2026-10-30 06:00–08:00 UTC").tagName).toBe("DEL");
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm I know it is cancelled" })).toBeEnabled();
  });
});

describe("the page keeps itself current for somebody with no socket", () => {
  it("polls every 15 seconds and picks up a change published while the page was open", async () => {
    vi.useFakeTimers();
    apiMocks.getSharedTruckAppointment.mockResolvedValue(shared({ change: null, windowVersion: 1 }));
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/No change has been published to this window/)).toBeInTheDocument();
    expect(apiMocks.getSharedTruckAppointment).toHaveBeenCalledTimes(1);

    apiMocks.getSharedTruckAppointment.mockResolvedValue(shared({ change: sharedChange() }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

    expect(apiMocks.getSharedTruckAppointment).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Your window has CHANGED · version 2")).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  it("a failed poll keeps the window on screen and labels the data, rather than claiming the link is dead", async () => {
    vi.useFakeTimers();
    renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("Your window has CHANGED · version 2")).toBeInTheDocument();

    apiMocks.getSharedTruckAppointment.mockRejectedValue(new Error("network unreachable"));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

    expect(screen.getByText(/This page could not refresh itself: network unreachable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    // The link is fine; the refresh was not. The page must not say otherwise.
    expect(screen.queryByText("This link cannot be used")).not.toBeInTheDocument();
    expect(screen.getByText("2026-10-30 08:00–10:00 UTC")).toBeInTheDocument();
  });

  it("stops polling once the page is closed", async () => {
    vi.useFakeTimers();
    const view = renderPage();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(apiMocks.getSharedTruckAppointment).toHaveBeenCalledTimes(1);

    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(apiMocks.getSharedTruckAppointment).toHaveBeenCalledTimes(1);
  });

  it("states when the link expires, so a haulier knows when to ask for a new one", async () => {
    apiMocks.getSharedTruckAppointment.mockResolvedValue(
      shared({ change: sharedChange(), link: { expiresAt: "2026-11-05T05:00:00.000Z", canAcknowledge: true } }),
    );
    renderPage();

    expect(await screen.findByText(/This link expires/)).toHaveTextContent(
      new Date("2026-11-05T05:00:00.000Z").toLocaleString(),
    );
  });
});
