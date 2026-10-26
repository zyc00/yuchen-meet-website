/**
 * @param {string} origin
 * @param {typeof fetch} [send]
 */
export function createApiClient(origin, send = fetch) {
  let base = '';
  if (origin) {
    const url = new URL(origin);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Invalid booking API origin.');
    }
    base = url.origin;
  }
  /** @param {string} path @param {RequestInit} [options] */
  return async (path, options) => {
    if (!path.startsWith('/api/') || path.includes('\\') || path.includes('/../')) {
      throw new Error('Invalid booking API path.');
    }
    if (!base) {
      if (path.startsWith('/api/availability?') && (!options?.method || options.method === 'GET')) {
        return Response.json({ready:false,slots:[],busy:[],timezone:'America/New_York',now:Date.now()});
      }
      return Response.json({error:'Booking is not available yet.'}, {status:503});
    }
    return send(base + path, options);
  };
}
export const apiFetch = createApiClient(import.meta.env?.VITE_BOOKING_API_ORIGIN || '');
