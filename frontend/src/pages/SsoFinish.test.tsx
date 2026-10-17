import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SsoFinish from './SsoFinish';

const mocks = vi.hoisted(() => ({
  exchangeSsoCode: vi.fn(),
  setToken: vi.fn(),
  setRefreshToken: vi.fn(),
  setLoginMode: vi.fn(),
}));

vi.mock('../api/ssoApi', () => ({ exchangeSsoCode: mocks.exchangeSsoCode }));
vi.mock('../api/client', () => ({
  setToken: mocks.setToken,
  setRefreshToken: mocks.setRefreshToken,
  setLoginMode: mocks.setLoginMode,
}));

describe('SsoFinish one-time code redemption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/sso/finish?code=one-time-code#finish');
  });

  afterEach(() => {
    cleanup();
  });

  it('redeems once under React StrictMode even though the effect is replayed', async () => {
    let resolveExchange!: (value: { access_token: string; refresh_token: string; user: unknown }) => void;
    const pending = new Promise<{ access_token: string; refresh_token: string; user: unknown }>((resolve) => {
      resolveExchange = resolve;
    });
    mocks.exchangeSsoCode.mockReturnValue(pending);

    render(<StrictMode><SsoFinish /></StrictMode>);

    expect(mocks.exchangeSsoCode).toHaveBeenCalledTimes(1);
    expect(mocks.exchangeSsoCode).toHaveBeenCalledWith('one-time-code');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#finish');

    await act(async () => {
      resolveExchange({ access_token: 'access', refresh_token: 'refresh', user: { id: 'u1' } });
      await pending;
    });

    expect(mocks.setToken).toHaveBeenCalledTimes(1);
    expect(mocks.setToken).toHaveBeenCalledWith('access');
    expect(mocks.setRefreshToken).toHaveBeenCalledTimes(1);
    expect(mocks.setRefreshToken).toHaveBeenCalledWith('refresh');
    expect(mocks.setLoginMode).toHaveBeenCalledTimes(1);
    expect(mocks.setLoginMode).toHaveBeenCalledWith('tenant');
  });

  it('fails closed and does not exchange when the redirect has no code', () => {
    window.history.replaceState(null, '', '/sso/finish');
    render(<SsoFinish />);

    expect(mocks.exchangeSsoCode).not.toHaveBeenCalled();
    expect(screen.getByText('Single sign-on did not return a session. Please try again.')).toBeInTheDocument();
  });
});
