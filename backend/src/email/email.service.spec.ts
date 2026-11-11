import axios from 'axios';
import { EmailService } from './email.service';

// The service posts through axios, not fetch — mocking the wrong transport
// left the real call in place, which the catch block then turned into a
// quiet `false`.
jest.mock('axios');

/**
 * EMAIL — transactional delivery.
 *
 * No tenant state: this is a transport, so there is no companyId here and no
 * cross-tenant leak to pin. What matters instead is that the service is honest
 * about whether a mail left the building, because its callers use the return
 * value to decide what to tell the user.
 *
 * Every caller except two discards that boolean (see the auth fix in this
 * change), which is what turns a delivery failure into a silent lie.
 */

function makeHarness(env: Record<string, string> = {}) {
  const config: any = {
    get: (key: string, fallback?: any) => env[key] ?? fallback,
  };
  return { svc: new EmailService(config as any) };
}

const OK_HTML = '<p>Hello</p>';

describe('EmailService — provider selection', () => {
  it('prefers Resend when a real key is present', () => {
    const { svc } = makeHarness({ RESEND_API_KEY: 're_live_123', SENDGRID_API_KEY: 'SG.live' });
    expect(svc.isConfigured).toBe(true);
    expect((svc as any).provider).toEqual('resend');
  });

  it('falls back to SendGrid when the Resend key is still the placeholder', () => {
    // The same trap as INTEGRATIONS_ENC_KEY: the template ships a placeholder
    // that is present but useless. isConfigured must not be fooled by it.
    const { svc } = makeHarness({ RESEND_API_KEY: 'CHANGE_ME', SENDGRID_API_KEY: 'SG.live' });
    expect((svc as any).provider).toEqual('sendgrid');
    expect(svc.isConfigured).toBe(true);
  });

  it('treats the SendGrid placeholder as unconfigured', () => {
    const { svc } = makeHarness({ SENDGRID_API_KEY: 'SG.CHANGE_ME' });
    expect(svc.isConfigured).toBe(false);
  });

  it('is unconfigured when no key is set at all', () => {
    const { svc } = makeHarness();
    expect(svc.isConfigured).toBe(false);
  });

  it('is unconfigured when the key is an empty string', () => {
    const { svc } = makeHarness({ RESEND_API_KEY: '', SENDGRID_API_KEY: '' });
    expect(svc.isConfigured).toBe(false);
  });

  it('falls back through the from-address chain', () => {
    const { svc } = makeHarness({ RESEND_API_KEY: 're_live' });
    expect((svc as any).fromEmail).toEqual('noreply@flowops.local');
    expect((svc as any).fromName).toEqual('FlowOps');

    const named = makeHarness({ RESEND_API_KEY: 're_live', EMAIL_FROM_NAME: 'FlowOps Ops' });
    expect((named.svc as any).fromName).toEqual('FlowOps Ops');
  });
});

describe('EmailService — send() never throws at its caller', () => {
  const post = axios.post as unknown as jest.Mock;

  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { id: 'msg-1' } });
  });

  it('returns false without calling the network when unconfigured', async () => {
    const { svc } = makeHarness();
    const out = await svc.send({ to: 'a@b.com', subject: 'Hi', html: OK_HTML });

    expect(out).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('returns true on a successful send', async () => {
    const { svc } = makeHarness({ RESEND_API_KEY: 're_live' });
    const out = await svc.send({ to: 'a@b.com', subject: 'Hi', html: OK_HTML });

    expect(out).toBe(true);
    expect(post).toHaveBeenCalled();
  });

  it('swallows a provider error and still returns false', async () => {
    // Callers rely on the boolean; a thrown error here would take down
    // resets, trial notices and alerts alike.
    post.mockRejectedValueOnce(new Error('upstream 500'));
    const { svc } = makeHarness({ RESEND_API_KEY: 're_live' });

    await expect(svc.send({ to: 'a@b.com', subject: 'Hi', html: OK_HTML })).resolves.toBe(false);
  });

  it('sends through SendGrid when that is the configured provider', async () => {
    const { svc } = makeHarness({ SENDGRID_API_KEY: 'SG.live' });

    expect(await svc.send({ to: 'a@b.com', subject: 'Hi', html: OK_HTML })).toBe(true);
    expect(post.mock.calls[0][0]).toContain('sendgrid');
  });

  it('prefers the plain-text part when both are supplied', async () => {
    // html is required by the type but text wins at send time
    // (params.text ?? html-stripped), so a text-only mail is not expressible
    // without passing a redundant html. Pinned rather than changed: widening
    // the type is a separate call.
    const { svc } = makeHarness({ RESEND_API_KEY: 're_live' });
    await svc.send({ to: 'a@b.com', subject: 'Hi', html: OK_HTML, text: 'plain-body' });

    expect(JSON.stringify(post.mock.calls[0][1])).toMatch(/plain-body/);
  });
});
