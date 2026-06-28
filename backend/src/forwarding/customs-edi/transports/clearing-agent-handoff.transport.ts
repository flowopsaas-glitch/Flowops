import { Injectable, Logger } from '@nestjs/common';
import { CustomsDeclaration } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../../email/email.service';
import { ForwardingPdfService } from '../../forwarding-pdf.service';
import { CustomsEdiTransport, CustomsEdiTransportResult, DecryptedCredential } from '../customs-edi-transport';

/**
 * The always-available, fully-honest path. FlowOps does NOT lodge with SARS;
 * instead it generates the SAD500 declaration package and hands it to the
 * tenant's nominated clearing agent (who is already accredited with SARS).
 *
 * `lodged` is always false — the agent performs the actual lodgement.
 */
@Injectable()
export class ClearingAgentHandoffTransport implements CustomsEdiTransport {
  private readonly logger = new Logger(ClearingAgentHandoffTransport.name);
  readonly path = 'CLEARING_AGENT_HANDOFF';

  constructor(
    private readonly pdf: ForwardingPdfService,
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  async verify(cred: DecryptedCredential): Promise<{ ok: boolean; reason?: string }> {
    if (!cred.agentEmail) {
      return { ok: false, reason: 'No clearing-agent email configured.' };
    }
    return { ok: true };
  }

  async transmit(cred: DecryptedCredential, declaration: CustomsDeclaration): Promise<CustomsEdiTransportResult> {
    const reference = `AGENT-${Date.now()}`;
    const agent = cred.agentEmail;

    // 1. Generate the SAD500 declaration package.
    let attachment: { content: string; filename: string; type: string } | null = null;
    try {
      const { buffer, filename } = await this.pdf.generate(cred.companyId, declaration.fileId, 'sad500');
      attachment = { content: buffer.toString('base64'), filename, type: 'application/pdf' };
    } catch (err: any) {
      this.logger.warn(`Could not generate SAD500 package for ${declaration.id}: ${err?.message ?? err}`);
    }

    // 2. Email the agent the package (best-effort; degrades to internal notification).
    let emailed = false;
    if (agent) {
      emailed = await this.email.send({
        to: agent,
        subject: `Customs declaration for lodgement — ${declaration.lrn ?? declaration.id}`,
        text: `A SAD500 declaration package is attached for lodgement with SARS. LRN: ${declaration.lrn ?? declaration.id}. Customs client code: ${cred.customsClientCode ?? '(provide)'}.`,
        html: `<p>A <strong>SAD500 declaration package</strong> is attached for lodgement with SARS.</p>
               <p>LRN: <strong>${declaration.lrn ?? declaration.id}</strong><br/>
               Customs client code: <strong>${cred.customsClientCode ?? '(to be supplied)'}</strong></p>
               <p>Please lodge and reply with the MRN once assigned.</p>`,
        ...(attachment ? { attachments: [{ ...attachment, disposition: 'attachment' as const }] } : {}),
      });
    }

    // 3. Internal staff notification (bell), best-effort.
    try {
      await this.prisma.notification.create({
        data: {
          companyId: cred.companyId,
          title: `Declaration handed to clearing agent · ${declaration.lrn ?? declaration.id}`,
          body: `SAD500 package ${emailed ? 'emailed to' : 'prepared for'} ${agent ?? 'the clearing agent'}. Awaiting SARS lodgement + MRN.`,
          type: 'CUSTOMS_HANDOFF',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Handoff notification failed: ${err?.message ?? err}`);
    }

    const note = agent
      ? `Package ${emailed ? 'sent to' : 'prepared for'} clearing agent ${agent}. NOT lodged with SARS — the agent lodges and returns the MRN.`
      : 'Declaration package prepared. NOT lodged with SARS — configure a clearing-agent email or download the SAD500 to hand over.';

    return { accepted: true, lodged: false, reference, note };
  }
}
