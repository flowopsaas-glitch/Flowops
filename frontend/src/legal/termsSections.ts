/** Readable summary aligned with `legal/TERMS_OF_SERVICE.md` — counsel owns canonical text. */
export const TERMS_SECTIONS: {
  id: string;
  title: string;
  paragraphs: string[];
}[] = [
  {
    id: 'parties',
    title: '1. Parties and acceptance',
    paragraphs: [
      'These Terms govern use of the FlowOps cloud platform and related services offered by FlowOps (Pty) Ltd. By using the Services (including ticking acceptance at sign-in), your organisation agrees to the current version of the Terms and the Privacy Notice.',
      'If you do not agree, do not use the Services.',
    ],
  },
  {
    id: 'subscription',
    title: '2. Subscription — not a sale of software',
    paragraphs: [
      'You receive a limited, revocable right to use the Services for your internal courier and logistics operations for as long as your subscription is active and fees are paid.',
      'You do not acquire ownership of FlowOps source code, object code, or documentation. Copying, reverse engineering, sublicensing, or resale is not permitted except as required by law.',
    ],
  },
  {
    id: 'acceptable-use',
    title: '3. Acceptable use, scraping and intellectual property',
    paragraphs: [
      'The Services — including their software, source and object code, APIs, user interfaces, visual design, workflows, data models, AI prompts and the CLAW automation engine — are the exclusive property of FlowOps (Pty) Ltd and are protected by copyright, trademark and other intellectual property laws.',
      'You may not, and may not permit any third party to: (a) copy, reproduce, clone, frame, mirror or imitate any part of the Services or their look and feel; (b) reverse engineer, decompile, disassemble or otherwise attempt to derive source code, algorithms or underlying ideas; (c) create derivative, similar or competing works based on the Services; or (d) remove, obscure or alter any proprietary notice.',
      'Automated access, scraping, crawling, spidering, bulk export or data harvesting — other than retrieval of your own data through documented, authorised API endpoints — is prohibited. You may not exceed published rate limits, circumvent access or security controls, or use the Services (or data obtained from them) to build a similar or competing product.',
      'FlowOps, CLAW and associated logos are trademarks of FlowOps (Pty) Ltd. All rights not expressly granted are reserved. We monitor for unauthorised copies and automated abuse, and reserve the right to throttle or suspend access and to pursue all available legal remedies.',
    ],
  },
  {
    id: 'logistics-risk',
    title: '4. Logistics outcomes and liability',
    paragraphs: [
      'FlowOps provides software tools only. It does not transport goods, act as carrier or insurer, or guarantee delivery times, OCR accuracy, AI suggestions, or uninterrupted availability.',
      'You remain responsible for operational decisions, insurance, subcontracting, and compliance with transport and consumer laws. Liability caps and exclusions apply as set out in the full Terms (see repository `legal/TERMS_OF_SERVICE.md`).',
    ],
  },
  {
    id: 'sla',
    title: '5. Availability',
    paragraphs: [
      'Unless a separate SLA is signed, availability is best-effort. Maintenance may occur with reasonable notice where practicable.',
    ],
  },
  {
    id: 'popia',
    title: '6. Data protection (POPIA)',
    paragraphs: [
      'Personal information (names, addresses, waybill data, etc.) is processed to deliver the Services. Details of purposes, retention, subprocessors, cross-border transfers, and data-subject rights are in the Privacy Notice.',
      'You warrant lawful authority to load personal information about your staff, drivers, and consignees. A data processing agreement may be signed where your compliance programme requires it.',
    ],
  },
  {
    id: 'changes',
    title: '7. Changes and version',
    paragraphs: [
      'We may update these documents. Material changes may require renewed acceptance in the product. The version shown at login is the record of what was accepted.',
    ],
  },
];

export const PRIVACY_SECTIONS: {
  id: string;
  title: string;
  paragraphs: string[];
}[] = [
  {
    id: 'operator',
    title: 'Operator',
    paragraphs: [
      'FlowOps (Pty) Ltd operates the platform. This notice summarises processing under POPIA; the markdown file in the repository is the template your counsel should finalise.',
    ],
  },
  {
    id: 'categories',
    title: 'Categories of information',
    paragraphs: [
      'Identity and contact data; operational and logistics data (addresses, waybills, PODs); technical logs; billing contacts. Avoid uploading special personal information unless strictly necessary and lawful.',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights',
    paragraphs: [
      'You may have rights of access, correction, deletion (where applicable), objection, and complaint to the South African Information Regulator. Use the contact details your organisation publishes once the Information Officer is appointed.',
    ],
  },
];
