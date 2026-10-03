/**
 * Annexure 25 — TOC Self-Screening Form ("Prospective Applicant Self-Screening Form —
 * Second Draft", 12 March 2024), supplied by the project owner on 2026-10-02.
 *
 * THE DOCUMENT IS A DRAFT ("Second Draft"). Treat the question set as provisional until
 * the final form is supplied (proposed EXC-034).
 *
 * What the annexure itself says about its use [ANX-25 intro 1-3]:
 *   1. it is a checklist the prospective TOC completes BEFORE the later phases;
 *   2. it is furnished as the COVER PAGE of the application;
 *   3. a populated copy is attached to the front of the submission pack "to assist the IM
 *      to identify any areas requiring special attention".
 * It does NOT say a "No" blocks an application — so FlowOps requires the form to be
 * complete (every question answered) and requires remarks for every "No", but does not
 * hard-block on a "No". That is a FlowOps design choice, flagged for the owner.
 *
 * NB the brief called Annexure 25 "flexing windows". The supplied document contains no
 * time windows (see docs/RAIL-RASA-AUDIT-2026-10-02.md §1 row 5).
 */

export interface SelfScreeningQuestion {
  /** Roman numeral exactly as printed: (i) … (vii). */
  no: string;
  /** Stable key for storage. */
  key: string;
  /** The assessment text, verbatim. */
  assessment: string;
  /** Evidence the question asks the applicant to attach, when it names one. */
  evidenceRequested?: string;
  /** Cross-reference named in the question. */
  refers?: string;
}

export const SELF_SCREENING_VERSION = 'Second Draft, 12 March 2024';

export const SELF_SCREENING_QUESTIONS: readonly SelfScreeningQuestion[] = [
  {
    no: 'i',
    key: 'solvency',
    assessment:
      "Is the prospective Applicant's business solvent and liquid? If the answer is \"Yes\", you are requested to submit signed letter issued by the currently appointed external auditors of the prospective Applicant confirming that it is a going concern and that it is solvent and liquid.",
    evidenceRequested: 'Signed letter from the currently appointed external auditors confirming going concern, solvency and liquidity',
  },
  {
    no: 'ii',
    key: 'rolling_stock_compliant',
    assessment:
      'Will the prospective Applicant have their own/leased rolling stock that is compliant with the prescribed specifications and that is compatible with the network configuration each as set out in the Information Pack, and will such rolling stock be available for physical inspection during the evaluation of any Application that it may submit in respect of the Competitive Contracting Process?',
  },
  {
    no: 'iii',
    key: 'rolling_stock_condition',
    assessment:
      'Will the asset condition of the rolling stock envisaged in question (ii) be such that it is capable of safe, immediate and ongoing operation on the Transnet freight rail network?',
  },
  {
    no: 'iv',
    key: 'crewing',
    assessment:
      'Does the prospective Applicant have adequate crewing manning methodology and details for Train communication equipment, available to operate trains in the slots and on the routes that are envisaged in the Information Pack and that it intends to apply for, within 3 months of the conclusion of the relevant contracts with Transnet?',
  },
  {
    no: 'v',
    key: 'training_rsr_permit',
    assessment:
      "Is the prospective Applicant willing to make its train operating personnel (including but not limited to its train drivers) available, at its own cost, to undergo any required training (as determined by the Faculty of Rail) including training in respect of the Local Area Working Rules and associated procedures? Please note that the deployment of suitable qualified and certified train operating personnel is a prerequisite for the granting of an RSR Permit and in accordance to SANS 3000-4 requirements.",
    refers: 'RSR Permit; SANS 3000-4',
  },
  {
    no: 'vi',
    key: 'operating_model_plans',
    assessment:
      "The prospective applicants have an appropriate business operating model, security plan, environment management plan and the prospective applicant's willingness to participate in the IM community and socio development plans.",
  },
  {
    no: 'vii',
    key: 'volume_guarantee',
    assessment:
      'The prospective applicants must ensure that there are rail volume forecasts and guarantees in the form of a letter confirming this from and signed by the cargo owner for timetable period or Framework agreement period. The letter should include the duration of the contract, tonnages (to be) contracted, confirmation that the TOC is the nominated haulage service provider. Refer to Annexure 34 (Volume Confirmation Letter).',
    evidenceRequested: 'Cargo-owner letter: contract duration, tonnages contracted, confirmation that the TOC is the nominated haulage provider',
    refers: 'Annexure 34 (Volume Confirmation Letter)',
  },
];

/** Access application types named on the form. */
export const SELF_SCREENING_ACCESS_TYPES = ['Network A', 'Network B'] as const;
export type SelfScreeningAccessType = (typeof SELF_SCREENING_ACCESS_TYPES)[number];

export type SelfScreeningAnswerValue = 'YES' | 'NO';
export interface SelfScreeningAnswer {
  no: string;
  answer: SelfScreeningAnswerValue;
  remarks?: string;
}

export interface SelfScreeningCheck {
  complete: boolean;
  /** Questions with no answer. */
  unanswered: string[];
  /** "No" answers — flagged for the IM's attention, not blocked. */
  flagged: string[];
  /** "No" answers that are missing the remarks the form invites. */
  missingRemarks: string[];
  /** Answers naming a question the form does not have. */
  unknownQuestions: string[];
}

/** Evaluate a set of answers against the 7-question form. Pure. */
export function evaluateSelfScreening(answers: readonly SelfScreeningAnswer[] | null | undefined): SelfScreeningCheck {
  const byNo = new Map<string, SelfScreeningAnswer>();
  const unknownQuestions: string[] = [];
  const known = new Set(SELF_SCREENING_QUESTIONS.map((q) => q.no));
  for (const a of answers ?? []) {
    if (!known.has(a.no)) unknownQuestions.push(a.no);
    else byNo.set(a.no, a);
  }
  const unanswered = SELF_SCREENING_QUESTIONS.filter((q) => !byNo.has(q.no)).map((q) => q.no);
  const flagged = SELF_SCREENING_QUESTIONS.filter((q) => byNo.get(q.no)?.answer === 'NO').map((q) => q.no);
  const missingRemarks = flagged.filter((no) => !(byNo.get(no)?.remarks ?? '').trim());
  return { complete: unanswered.length === 0 && unknownQuestions.length === 0, unanswered, flagged, missingRemarks, unknownQuestions };
}
