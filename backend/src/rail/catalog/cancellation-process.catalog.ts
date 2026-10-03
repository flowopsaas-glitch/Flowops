/**
 * Annexure 20a — Cancel or re-plan / re-schedule TOC train process, v4 (30 Sep 2024).
 * Source: "ANNEXURE 20a — CANCEL OR RE-PLAN / RE-SCHEDULE TOC TRAIN PROCESS v4", supplied by
 * the project owner on 2026-10-02 (version control: v2 11 Mar 2024, v3 27 Sep 2024, v4 30 Sep 2024).
 *
 * POPIA / EXC-022: the annexure's sign-off block names individuals. They are NOT copied
 * here — only the roles and designations are kept. The annexure's internal server path is
 * also omitted.
 *
 * Evidence tags: [ANX-20a step n]. Where a number is not printed in the source it is
 * marked `stepNumberInferred`.
 *
 * READING NOTE (proposed EXC-032): the pasted diagram text labels the ">48 hours" path
 * "NO branch (>48 hours)" and the other path "NO branch →" under the same decision
 * ("Is Cancellation Request received >48 Hours before real time?"). The step CONTENT
 * disambiguates it and FlowOps follows the content:
 *   - request received 48 h or less before real time → "emergency dynamic version of the ITP"
 *   - request received more than 48 h before real time → "relevant planning version of the
 *     ITP (7 day, 72 hour, 48 hour)"
 * Confirm against the original diagram.
 */

export const ANNEXURE_20A_VERSION = 'v4 (30 Sep 2024)';

/** Who may start a cancellation request — steps 1–5. */
export type CancellationInitiator =
  | 'TOC'
  | 'YARD_OPERATOR'
  | 'TRIM'
  | 'PORT_TERMINAL_OPERATOR'
  | 'PRASA_OTHER_IM';

export const CANCELLATION_INITIATORS: ReadonlyArray<{ value: CancellationInitiator; step: number; label: string; via?: string }> = [
  { value: 'TOC', step: 1, label: 'Train Operating Company (TOC)', via: 'IM Customer Liaison Officer directly AND via TOL (TEMS-TOMS)' },
  { value: 'YARD_OPERATOR', step: 2, label: 'Yard Operating Company (YOC) — on behalf of the IM', via: 'TOL, directly to authorised IM personnel' },
  { value: 'TRIM', step: 3, label: 'TRIM (any department: Asset Maintenance and Management, Security, Network Service Planning, Network Operations, Safety, …)' },
  { value: 'PORT_TERMINAL_OPERATOR', step: 4, label: 'Port / Port Terminal Operator (TPT)', via: 'directly to authorised IM personnel' },
  { value: 'PRASA_OTHER_IM', step: 5, label: 'PRASA / Over-Border IM / Other IM' },
];

/** The ITP planning versions named in step 14 ("relevant planning version of ITP (7 day, 72 hour, 48 hour)"). */
export const ITP_PLANNING_VERSIONS = ['7_DAY', '72_HOUR', '48_HOUR'] as const;
export type ItpPlanningVersion = (typeof ITP_PLANNING_VERSIONS)[number];

/**
 * Timings stated in Annexure 20a. Every number here is quoted from a step, not derived.
 */
export const ANNEXURE_20A_TIMINGS = {
  /** Steps 1–4: "cancellation notice must be issued within 15 minutes of the event's occurrence or as soon as it is discovered …". */
  noticeWithinMinutes: 15,
  /** Step 6: "Acknowledge receipt of the train cancellation request within 1 hour". */
  acknowledgeWithinHours: 1,
  /** Decision: "Is Cancellation Request received >48 Hours before real time?". */
  shortNoticeThresholdHours: 48,
} as const;

export interface CancellationProcessStep {
  step: number;
  title: string;
  /** Bullet points of the step, condensed but faithful. */
  detail: string[];
  /** Number not printed in the source text. */
  stepNumberInferred?: boolean;
  /** Which path of the ">48 hours" decision the step sits on. */
  path: 'COMMON' | 'SHORT_NOTICE_LE_48H' | 'LONG_NOTICE_GT_48H' | 'CONVERGED';
}

export const CANCELLATION_PROCESS_STEPS: readonly CancellationProcessStep[] = [
  { step: 1, path: 'COMMON', title: 'Submit TOC Request for Train Cancellation with reasons (via TOL / TEMS-TOMS)', detail: [
    'Request TOC train(s) to be cancelled due to TOC reasons.',
    'Authorised TOC personnel must contact the IM Customer Liaison Officer directly.',
    'Request must also be submitted via TOL; TOC selects the possible cancellation reason(s) on TOL.',
    "Notice within 15 minutes of the event's occurrence, or as soon as it is discovered that there will be a TOC mainline slot compromise (incidents, operational issues, resource constraints …).",
  ] },
  { step: 2, path: 'COMMON', title: 'Submit Yard Operating Company (YOC) request for train(s) cancellations due to Yard Operator reasons (via TOL)', detail: [
    'Only authorised Yard Operator personnel can communicate TOC train cancellations — directly to authorised IM personnel.',
    'Notice within 15 minutes of occurrence / discovery.',
  ] },
  { step: 3, path: 'COMMON', title: 'Submit TRIM Request for Train Cancellation', detail: [
    'Request TOC train(s) to be cancelled due to TRIM reasons.',
    'Notice within 15 minutes of occurrence / discovery.',
    'Cross-reference in the diagram: par 6.5.4.2 in the Network Statement.',
  ] },
  { step: 4, path: 'COMMON', title: 'Submit Port / Port Terminal Operator Request for Train Cancellation', detail: [
    'Only authorised Port / Port Terminal Operator personnel can communicate TOC train cancellations — directly to authorised IM personnel.',
    'Notice within 15 minutes of occurrence / discovery.',
    'Cross-reference in the diagram: par 6.5.4.2 in the Network Statement.',
  ] },
  { step: 5, path: 'COMMON', title: 'Submit PRASA / Over-Border IM / Other IM Request for Train Cancellation', detail: [] },
  { step: 6, path: 'COMMON', title: 'Receive notification of TOC Train Cancellation Request and acknowledge receipt', detail: [
    'Authorised TOC personnel must contact the IM Customer Liaison Officer directly.',
    'Acknowledge receipt of the train cancellation request within 1 hour.',
  ] },
  { step: 7, path: 'COMMON', title: 'Capture TOC trains to be cancelled, reasons and responsible party (Daily Handshake Process — Daily Handshake Report Template, via designated e-mail per corridor)', detail: [
    'Capture and verify the reason for the cancellation linked to the Train Slot Number (including Force Majeure) and all supporting information required by the Daily Handshake Template.',
    'Log all incidents that impact train slot utilisation and on-time train performance.',
    'Use incident information from TOMS/TEMS ("TOC Execution and Monitoring" process) and the Daily Handshake Templates.',
  ] },
  { step: 8, path: 'SHORT_NOTICE_LE_48H', title: 'Assess total ITP impact of the requested TOC Train Cancellation (Execution and Monitoring Process)', detail: [
    'Capture the cancellation reason; state whether it is outside IM control (Force Majeure).',
    'Assess which other TOC trains are impacted; check the cancellation clauses in the rail access agreement; impact assessment for the full corridor.',
  ] },
  { step: 9, path: 'SHORT_NOTICE_LE_48H', title: 'Prioritise all impacted TOC slots', detail: [] },
  { step: 10, path: 'SHORT_NOTICE_LE_48H', title: 'Assess if the impacted TOC train(s) can be re-planned, re-scheduled or re-routed', detail: ['Decision: can impacted TOC train(s) be re-planned, re-scheduled or re-routed?'] },
  { step: 11, path: 'SHORT_NOTICE_LE_48H', title: 'Assess possible alternative available slot(s) and propose re-planned / re-scheduled / re-routed slot(s)', detail: [] },
  { step: 12, path: 'SHORT_NOTICE_LE_48H', title: 'Discuss possible alternative slot(s) with TOCs (receive possible alternative slots)', detail: [] },
  { step: 13, path: 'SHORT_NOTICE_LE_48H', title: 'Provide TOC train rescheduling inputs', detail: ['Decision: did the TOC accept the proposed re-planned / re-scheduled / re-routed slots?'] },
  { step: 14, path: 'SHORT_NOTICE_LE_48H', title: 'Update an emergency dynamic version of the ITP', detail: ['(">48 hours" path, same step number: "Update relevant planning version of ITP (7 day, 72 hour, 48 hour)".)'] },
  { step: 15, path: 'SHORT_NOTICE_LE_48H', title: 'Communicate the updated emergency dynamic version of the ITP', detail: ['(">48 hours" path: "Communicate the updated relevant planning version of ITP (7 day, 72 hour, 48 hour)".)'] },
  { step: 16, path: 'SHORT_NOTICE_LE_48H', title: 'Acknowledge receipt of updated ITP (containing re-planned / re-scheduled / re-routed slot(s))', detail: [] },
  { step: 17, path: 'SHORT_NOTICE_LE_48H', title: 'Provide pilot services for TOC crew that lacks route knowledge on new re-scheduled routes', detail: ['This service can be provided by TFROC to TOCs at a fee.'] },
  { step: 18, path: 'CONVERGED', title: 'Cancel requested / impacted TOC train(s) and update ITP', detail: ['Reached when the impacted trains cannot be re-planned, re-scheduled or re-routed.'] },
  { step: 19, path: 'CONVERGED', title: 'Notify impacted TOC(s) of train cancellation(s)', detail: [] },
  { step: 20, path: 'CONVERGED', title: 'Compile TOC Train Cancellation Notice, with reasons and responsible parties', detail: [] },
  { step: 21, path: 'CONVERGED', title: 'Acknowledge receipt of train cancellation(s)', detail: ['Decision: does a cancelled en-route TOC train require staging?'] },
  { step: 22, path: 'CONVERGED', stepNumberInferred: true, title: 'Stage the impacted TOC train', detail: ['Printed without a number in the source; 23 and 24 follow it.'] },
  { step: 23, path: 'CONVERGED', title: 'Arrange security measures to safeguard staged trains', detail: [] },
  { step: 24, path: 'CONVERGED', title: 'Re-plan movement of staged train', detail: ['If no staging is required: go to the TOC Charges and Penalties Process (skip steps 18–24, go to end interfaces where applicable).'] },
];

/** Approval roles recorded by the annexure (names deliberately omitted — POPIA / EXC-022). */
export const ANNEXURE_20A_APPROVAL_ROLES: ReadonlyArray<{ role: string; designation: string }> = [
  { role: 'Process Owner', designation: 'Head of Planning & Execution' },
  { role: 'Process Compiler', designation: 'Senior Manager (BPM)' },
  { role: 'General Manager', designation: 'Interim Infrastructure Manager' },
  { role: 'Acting GM Office of the CE', designation: 'Interim Infrastructure Manager' },
];

/**
 * Annexure 21 — Clearinghouse Process Narrative (v5 per the cover, "V4" per the body header —
 * register EXC-013; CONFIDENTIAL-marked). Only the numeric business rules are kept here; the
 * narrative and the named staff are not. Revision table dates run backwards (v2 27 Oct 2023,
 * v3 11 Mar 2023) — proposed EXC-035.
 */
export const ANNEXURE_21_RULES = {
  /** "There is a 24-hour window that is allowed for the discussion and dispute of train cancellation reasons". */
  disputeWindowHours: 24,
  /** "Train Cancellations older than 48 hours will not be open for dispute". */
  closedToDisputeAfterHours: 48,
  /** "Further investigations … to be resolved and coordinated by the Network Operations Interface Manager within 48 hours". */
  unresolvedInvestigationWithinHours: 48,
  /** National Clearinghouse: daily at 12h00 Tuesday–Friday, 10h30 Monday. */
  nationalClearinghouse: { tueToFri: '12:00', monday: '10:30' },
} as const;
