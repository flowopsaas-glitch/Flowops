/**
 * Canonical webhook/outbox event names. This is a PUBLIC CONTRACT: integrators
 * subscribe to these strings, so existing names never change. Keep in sync with
 * frontend EVENT_OPTIONS (Integrations page).
 */
export const EVENT_CATALOG = [
  // Waybills & returns (pre-existing events — names must not change)
  'waybill.status_changed',
  'return.status_changed',
  // Rail — slot application lifecycle
  'rail.slot.created',
  'rail.slot.submitted',
  'rail.slot.allocated',
  'rail.slot.rejected',
  'rail.slot.expired',
  'rail.slot.operated',
  'rail.slot.capacity_conflict',
  'rail.slot.conflict_resolved',
  // Rail — Daily Handshake (TOC↔IM)
  'rail.handshake.report_created',
  'rail.handshake.report_issued',
  'rail.handshake.signed_off',
  'rail.handshake.deviation_logged',
  'rail.handshake.deviation_reviewed',
  // Rail — possessions (planned maintenance / occupation windows)
  'rail.possession.created',
  'rail.possession.status_changed',
  // Rail — digital train manifests (the departure document)
  'rail.manifest.created',
  'rail.manifest.issued',
  'rail.manifest.amended',
  'epod.captured',
  'epod.verified',
  'epod.disputed',
  'epod.dispute_resolved',
  'driver.duty.force_ended',
  'rail.manifest.departed',
  'rail.manifest.arrived',
  'rail.manifest.closed',
  'rail.manifest.cancelled',
  // Rail — telemetry (Phase 3): devices and health alerts
  'rail.telemetry.device_registered',
  'rail.telemetry.device_status_changed',
  'rail.telemetry.alert_raised',
  'rail.telemetry.alert_updated',
  // Driver portal — shift duties (mode switching)
  'driver.duty.started',
  'driver.duty.completed',
] as const;

export type FlowOpsEvent = (typeof EVENT_CATALOG)[number];

export function isKnownEvent(event: string): event is FlowOpsEvent {
  return (EVENT_CATALOG as readonly string[]).includes(event);
}
