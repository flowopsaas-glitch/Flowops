import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ackSharedTruckAppointment,
  ackWindowChange,
  createTruckShareLink,
  getSharedTruckAppointment,
  getWindowAckBoard,
  listTruckAppointments,
  replanTruckDay,
  revokeTruckShareLink,
  transitionTruckAppointment,
  upsertGateAckPolicy,
} from "./railTruckAppointmentsApi";

/**
 * The wire contract of the truck-window client.
 *
 * A component test can only prove that a page asked for a confirmation; it
 * cannot prove the confirmation is safe to retry. That lives here:
 *   - every mutation that can be double-submitted (a double tap, a flaky
 *     connection, an offline flush) carries `X-Idempotency-Key` as a HEADER,
 *     which is the only place the backend reads it from;
 *   - a share-link acknowledgement posts the token in the path and nothing
 *     identifying in the body, so the token stays the only credential and a
 *     counterparty cannot name a recipient they are not;
 *   - ids are URL-encoded, and a payload that is not the array the UI expects
 *     degrades to `[]` instead of throwing inside a render.
 */

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./client", () => ({ api: apiMock }));

/** The axios wrapper hands back either `{ data }` or the payload itself. */
const envelope = (payload: unknown) => ({ data: payload });

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.post.mockReset();
  apiMock.put.mockReset();
  apiMock.delete.mockReset();
});

describe("mutations that can be submitted twice", () => {
  it("sends the idempotency key as a header on a share-link acknowledgement", async () => {
    apiMock.post.mockResolvedValue(envelope({ idempotentReplay: false }));

    await ackSharedTruckAppointment("tok_share_1", {
      idempotencyKey: "share-ack:chg_1",
      deviceAckedAt: "2026-10-29T05:12:00.000Z",
    });

    expect(apiMock.post).toHaveBeenCalledWith(
      "/rail/truck-appointments/public/tok_share_1/ack",
      { deviceAckedAt: "2026-10-29T05:12:00.000Z" },
      { headers: { "X-Idempotency-Key": "share-ack:chg_1" } },
    );
  });

  it("omits the device time when the caller has none, rather than sending an empty string", async () => {
    apiMock.post.mockResolvedValue(envelope({ idempotentReplay: true }));

    await ackSharedTruckAppointment("tok_share_1", { idempotencyKey: "k" });

    const [, body] = apiMock.post.mock.calls[0];
    expect(body).toEqual({});
    expect(body).not.toHaveProperty("deviceAckedAt");
  });

  it("URL-encodes the token, because a token is not a path segment", async () => {
    apiMock.post.mockResolvedValue(envelope({}));

    await ackSharedTruckAppointment("tok/with+special&chars");

    expect(apiMock.post.mock.calls[0][0]).toBe(
      "/rail/truck-appointments/public/tok%2Fwith%2Bspecial%26chars/ack",
    );
  });

  it("sends the idempotency key on a tenant-user acknowledgement too", async () => {
    apiMock.post.mockResolvedValue(envelope({ idempotentReplay: false }));

    await ackWindowChange("chg_1", { idempotencyKey: "ack:chg_1:rec_haulier" });

    expect(apiMock.post).toHaveBeenCalledWith(
      "/rail/truck-window-changes/chg_1/ack",
      {},
      { headers: { "X-Idempotency-Key": "ack:chg_1:rec_haulier" } },
    );
  });

  it("posts an empty body when acknowledging: who is confirming comes from the session, never from the client", async () => {
    apiMock.post.mockResolvedValue(envelope({}));

    await ackWindowChange("chg_1");

    const [, body, config] = apiMock.post.mock.calls[0];
    expect(body).toEqual({});
    // No key means no config at all — the third axios argument is a config object.
    expect(config).toBeUndefined();
  });

  it("carries the key on a reschedule, which is the mutation that moves a published window", async () => {
    apiMock.post.mockResolvedValue(envelope({ id: "appt_1" }));

    await transitionTruckAppointment(
      "appt_1",
      "reschedule",
      { windowStart: "2026-10-30T08:00:00.000Z", windowEnd: "2026-10-30T10:00:00.000Z", reason: "Crane crew changeover" },
      "reschedule:appt_1:v2",
    );

    expect(apiMock.post).toHaveBeenCalledWith(
      "/rail/truck-appointments/appt_1/reschedule",
      {
        windowStart: "2026-10-30T08:00:00.000Z",
        windowEnd: "2026-10-30T10:00:00.000Z",
        reason: "Crane crew changeover",
      },
      { headers: { "X-Idempotency-Key": "reschedule:appt_1:v2" } },
    );
  });

  it("carries the key on a day replan, which moves many windows in one submit", async () => {
    apiMock.post.mockResolvedValue(envelope({ shifted: 4, skipped: [] }));

    await replanTruckDay(
      { terminalName: "Central Terminal", date: "2026-10-30", shiftMinutes: 120, reason: "Crane down" },
      "replan:central:2026-10-30",
    );

    expect(apiMock.post).toHaveBeenCalledWith(
      "/rail/truck-appointments/replan-day",
      { terminalName: "Central Terminal", date: "2026-10-30", shiftMinutes: 120, reason: "Crane down" },
      { headers: { "X-Idempotency-Key": "replan:central:2026-10-30" } },
    );
  });
});

describe("reads and link lifecycle", () => {
  it("reads the shared view through the public token path", async () => {
    apiMock.get.mockResolvedValue(envelope({ terminalName: "Central Terminal" }));

    const view = await getSharedTruckAppointment("tok_share_1");

    expect(apiMock.get).toHaveBeenCalledWith("/rail/truck-appointments/public/tok_share_1");
    expect(view.terminalName).toBe("Central Terminal");
  });

  it("unwraps a bare payload as well as a { data } envelope", async () => {
    apiMock.get.mockResolvedValue({ terminalName: "Bare" });

    await expect(getSharedTruckAppointment("t")).resolves.toMatchObject({ terminalName: "Bare" });
  });

  it("creates and revokes a share link on the appointment, not on a change", async () => {
    apiMock.post.mockResolvedValue(envelope({ token: "tok_new", path: "/gate/tok_new", expiresAt: "2026-11-05T00:00:00.000Z" }));
    apiMock.delete.mockResolvedValue(envelope({ revoked: true }));

    await expect(createTruckShareLink("appt_1")).resolves.toMatchObject({ token: "tok_new" });
    expect(apiMock.post).toHaveBeenCalledWith("/rail/truck-appointments/appt_1/share", {});

    await expect(revokeTruckShareLink("appt_1")).resolves.toMatchObject({ revoked: true });
    expect(apiMock.delete).toHaveBeenCalledWith("/rail/truck-appointments/appt_1/share");
  });

  it("degrades to an empty list when the payload is not an array, instead of throwing inside a render", async () => {
    apiMock.get.mockResolvedValue(envelope({ message: "unexpected shape" }));

    await expect(listTruckAppointments()).resolves.toEqual([]);
  });

  it("passes no params at all when the board is not filtered by terminal", async () => {
    apiMock.get.mockResolvedValue(envelope({ rows: [], counts: {} }));

    await getWindowAckBoard();
    expect(apiMock.get).toHaveBeenCalledWith("/rail/truck-window-changes/board", { params: undefined });

    await getWindowAckBoard("Central Terminal");
    expect(apiMock.get).toHaveBeenLastCalledWith("/rail/truck-window-changes/board", {
      params: { terminalName: "Central Terminal" },
    });
  });

  it("writes the per-terminal acknowledgement thresholds as one upsert", async () => {
    apiMock.put.mockResolvedValue(envelope({ terminalName: "Central Terminal", ackDueMinutes: 45 }));

    await upsertGateAckPolicy("Central Terminal", {
      ackDueMinutes: 45,
      reminderAfterMinutes: 20,
      escalateAfterMinutes: 60,
    });

    expect(apiMock.put).toHaveBeenCalledWith("/rail/truck-window-changes/gate-policies", {
      terminalName: "Central Terminal",
      ackDueMinutes: 45,
      reminderAfterMinutes: 20,
      escalateAfterMinutes: 60,
    });
  });
});
