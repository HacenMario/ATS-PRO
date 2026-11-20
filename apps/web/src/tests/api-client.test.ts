/** API client: token refresh retry, error mapping. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// localStorage is available in jsdom
const fetchMock = vi.fn();

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    localStorage.clear();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends X-Requested-With + credentials and maps error codes', async () => {
    const { api } = await import('@/lib/api');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'errors.forbidden' } }), { status: 403 }));
    await expect(api('/api/x')).rejects.toMatchObject({ code: 'errors.forbidden', status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('retries once through /auth/refresh after a 401 then succeeds', async () => {
    const { api } = await import('@/lib/api');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'errors.unauthenticated' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: 'a2', refreshToken: 'r2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await api<{ ok: boolean }>('/api/protected');
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, refreshInit] = fetchMock.mock.calls[1]!;
    expect(String(refreshInit.url ?? '/api/auth/refresh')).toContain('/api/auth/refresh');
  });

  it('gives up after a failed refresh (single retry)', async () => {
    const { api } = await import('@/lib/api');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'errors.unauthenticated' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response('refresh failed', { status: 401 }));
    await expect(api('/api/protected')).rejects.toMatchObject({ code: 'errors.unauthenticated' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
