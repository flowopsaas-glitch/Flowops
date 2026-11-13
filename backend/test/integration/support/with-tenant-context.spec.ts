/**
 * `withTenantContext` against a stub client.
 *
 * These cases need no database — they assert the shape of the wrapper, not the
 * SQL — but they live with the integration suite because that is what they
 * protect: the hand-built client this suite injects into services must carry
 * `withTenant`, or a service that establishes tenant context works in
 * production and dies here with `withTenant is not a function`.
 */
import { withTenantContext } from './prisma-client';

describe('withTenantContext', () => {
  function fakeClient() {
    const calls: any[] = [];
    const client: any = {
      async $transaction(fn: any, options?: any) {
        calls.push({ type: 'begin', options });
        const tx = {
          async $executeRaw(...args: any[]) {
            calls.push({ type: 'set_config', args });
          },
        };
        const out = await fn(tx);
        calls.push({ type: 'commit' });
        return out;
      },
    };
    return { client, calls };
  }

  it('adds withTenant and sets the tenant inside a transaction', async () => {
    const { client, calls } = fakeClient();
    const withTenant = withTenantContext(client);
    expect(typeof withTenant.withTenant).toBe('function');

    const result = await withTenant.withTenant('company-a', async (tx) => {
      expect(tx).toBeTruthy();
      return 'done';
    });
    expect(result).toBe('done');

    expect(calls[0]).toMatchObject({ type: 'begin' });
    expect(calls[1].type).toBe('set_config');
    expect(calls[2]).toMatchObject({ type: 'commit' });
  });

  it('refuses an empty tenant instead of running unisolated', async () => {
    const { client, calls } = fakeClient();
    const withTenant = withTenantContext(client);
    await expect(withTenant.withTenant('   ', async () => 'x')).rejects.toThrow(/non-empty companyId/);
    expect(calls).toHaveLength(0);
  });

  it('passes transaction options through', async () => {
    const { client, calls } = fakeClient();
    const withTenant = withTenantContext(client);
    await withTenant.withTenant('company-a', async () => 1, { timeout: 5000 });
    expect(calls[0].options).toEqual({ timeout: 5000 });
  });

  it('is idempotent — does not re-wrap a client that already has it', async () => {
    const { client } = fakeClient();
    const once = withTenantContext(client);
    const marker = once.withTenant;
    const twice = withTenantContext(once);
    expect(twice.withTenant).toBe(marker);
  });
});
