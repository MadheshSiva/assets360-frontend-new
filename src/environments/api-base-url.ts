/**
 * THE backend address. Every API call (auth, geofences, assets, reports, ...) goes through this one gateway URL.
 *
 * The Cloudflare tunnel gets a new URL each time it restarts: paste the new one here (keep the trailing slash),
 * then restart `npm start`. Nothing else needs to change.
 *
 * Local backend in Docker instead of the tunnel: 'http://172.16.100.29:5296/'
 */
export const API_BASE_URL = 'http://172.16.100.29:5296/';
