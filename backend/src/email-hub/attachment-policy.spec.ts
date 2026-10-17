import { BadRequestException } from '@nestjs/common';
import { validateEmailAttachment } from './attachment-policy';
import { EmailHubService } from './email-hub.service';

const pdf = Buffer.from('%PDF-1.7\nexample document');
const supportedPdf = {
  originalname: 'invoice.pdf',
  mimetype: 'application/pdf',
  size: pdf.length,
  buffer: pdf,
};

describe('outbound email attachment policy', () => {
  it('accepts an allowlisted PDF with a matching signature', () => {
    expect(() => validateEmailAttachment(supportedPdf)).not.toThrow();
  });

  it('rejects executables, mismatched MIME/signatures, and CRLF header-injection filenames', () => {
    expect(() => validateEmailAttachment({
      ...supportedPdf,
      originalname: 'invoice.exe',
      mimetype: 'application/x-msdownload',
    })).toThrow(BadRequestException);
    expect(() => validateEmailAttachment({
      ...supportedPdf,
      mimetype: 'image/png',
    })).toThrow(BadRequestException);
    expect(() => validateEmailAttachment({
      ...supportedPdf,
      originalname: 'invoice\r\nBcc:attacker@example.net.pdf',
    })).toThrow(BadRequestException);
  });

  it.each(['\u0000', '\u001f', '\u007f'])(
    'rejects a filename containing control character %p',
    (controlCharacter) => {
      expect(() => validateEmailAttachment({
        ...supportedPdf,
        originalname: `invoice${controlCharacter}.pdf`,
      })).toThrow(BadRequestException);
    },
  );

  it('enforces exact byte size and the 5 MiB per-file bound', () => {
    expect(() => validateEmailAttachment({ ...supportedPdf, size: pdf.length + 1 })).toThrow(BadRequestException);
    expect(() => validateEmailAttachment({ ...supportedPdf, size: 5 * 1024 * 1024 + 1 })).toThrow(BadRequestException);
  });

  it('rejects unsupported outgoing files before creating an email record', async () => {
    const prisma = { emailHubItem: { create: jest.fn() } };
    const service = new EmailHubService(prisma as any, {} as any, {} as any, {} as any, {} as any);
    const executable = {
      originalname: 'invoice.exe',
      mimetype: 'application/x-msdownload',
      size: 4,
      buffer: Buffer.from('MZ\x00\x00'),
    };

    await expect(service.send('company-1', { to: 'client@example.net', subject: 'Invoice' }, [executable]))
      .rejects.toThrow(BadRequestException);
    expect(prisma.emailHubItem.create).not.toHaveBeenCalled();
  });
});
