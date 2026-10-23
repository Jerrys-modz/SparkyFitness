import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sealGarminMfaState } from '../integrations/garminconnect/garminMfaState.js';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('axios', () => ({
  default: {
    create: () => ({ post }),
    isAxiosError: (error: unknown) =>
      Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const { default: garminConnectService } =
  await import('../integrations/garminconnect/garminConnectService.js');

const PENDING = {
  domain: 'garmin.com',
  flow: 'widget',
  cookies: [{ name: 'SESSION', value: 'secret-cookie' }],
};

async function startSignIn(userId = 'user-1') {
  post.mockResolvedValueOnce({
    data: { status: 'needs_mfa', client_state: PENDING },
  });
  const result = await garminConnectService.garminLogin(userId, 'e', 'p');
  return result.client_state as string;
}

beforeEach(() => {
  post.mockReset();
});

describe('a Garmin sign-in waiting for its MFA code', () => {
  it('reaches the browser sealed and is finished from the sealed copy', async () => {
    const sealed = await startSignIn();
    expect(typeof sealed).toBe('string');
    expect(sealed).not.toContain('secret-cookie');

    post.mockResolvedValueOnce({
      data: { status: 'success', tokens: { di_token: 't' } },
    });
    await garminConnectService.garminResumeLogin('user-1', sealed, '123456');

    expect(post).toHaveBeenLastCalledWith(
      expect.stringContaining('/auth/garmin/resume_login'),
      { user_id: 'user-1', client_state: PENDING, mfa_code: '123456' }
    );
  });

  it('cannot be finished by another user', async () => {
    const sealed = await startSignIn('user-1');
    await expect(
      garminConnectService.garminResumeLogin('user-2', sealed, '123456')
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('expires after five minutes', async () => {
    const sealed = await sealGarminMfaState(
      'user-1',
      PENDING,
      Date.now() - 5 * 60 * 1000 - 1
    );
    await expect(
      garminConnectService.garminResumeLogin('user-1', sealed, '123456')
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(post).not.toHaveBeenCalled();
  });

  it('is refused when altered', async () => {
    const sealed = await startSignIn();
    const [iv, tag, text] = sealed.split('.');
    const altered = `${iv}.${tag}.${text.slice(0, -4)}AAAA`;
    await expect(
      garminConnectService.garminResumeLogin('user-1', altered, '123456')
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      garminConnectService.garminResumeLogin('user-1', 'not-sealed', '123456')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('sends the code to Garmin once, even when the service fails', async () => {
    const sealed = await startSignIn();
    post.mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 500',
      response: { status: 500, data: { detail: 'boom' } },
    });
    await expect(
      garminConnectService.garminResumeLogin('user-1', sealed, '123456')
    ).rejects.toThrow('Failed to complete Garmin MFA: boom');
    expect(post).toHaveBeenCalledTimes(2); // the login, then one resume
  });
});
