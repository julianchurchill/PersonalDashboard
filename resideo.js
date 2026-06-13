import { loadTokens, saveTokens } from './tokenStore.js';

const API_BASE = 'https://api.honeywellhome.com';
const REDIRECT_URI = 'http://localhost:3000/auth/callback';

function basicAuth() {
  const { RESIDEO_CLIENT_ID: id, RESIDEO_CLIENT_SECRET: secret } = process.env;
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

export function isConfigured() {
  return !!(process.env.RESIDEO_CLIENT_ID && process.env.RESIDEO_CLIENT_SECRET);
}

export function getAuthUrl() {
  return `${API_BASE}/oauth2/authorize?response_type=code&client_id=${process.env.RESIDEO_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
}

export async function exchangeCode(code) {
  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  saveTokens(await res.json());
}

async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens) return null;

  if (Date.now() < tokens.savedAt + tokens.expires_in * 1000 - 30_000) {
    return tokens.access_token;
  }

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const refreshed = await res.json();
  saveTokens(refreshed);
  return refreshed.access_token;
}

export async function getStatus() {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const res = await fetch(
    `${API_BASE}/v2/locations?apikey=${process.env.RESIDEO_CLIENT_ID}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Locations fetch failed: ${res.status}`);
  const locations = await res.json();

  const zones = locations.flatMap(loc =>
    (loc.devices ?? []).map(d => ({
      id: d.deviceID,
      name: d.userDefinedDeviceName ?? d.name,
      temperature: d.indoorTemperature ?? null,
      target: d.changeableValues?.heatSetpoint ?? null,
      mode: d.operationStatus?.mode ?? null,
    }))
  );

  return { zones };
}
