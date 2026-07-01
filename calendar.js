import { loadTokens, saveTokens } from './tokenStore.js';

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/calendar/v3';
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_NAME = 'google';

export function isCalendarConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getCalendarAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${AUTH_BASE}?${params}`;
}

export async function exchangeCalendarCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  saveTokens(await res.json(), TOKEN_NAME);
}

async function getAccessToken() {
  const tokens = loadTokens(TOKEN_NAME);
  if (!tokens) return null;

  if (Date.now() < tokens.savedAt + tokens.expires_in * 1000 - 30_000) {
    return tokens.access_token;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // An expired or revoked refresh token comes back as 400 invalid_grant.
    // That needs the user to re-authorise, so surface it as "unauthorized"
    // (return null) rather than a hard error — which lets the header show the
    // re-connect link instead of rendering nothing. Other failures (network,
    // 5xx) stay as errors so a transient blip isn't mistaken for logout.
    if (res.status === 400 && body.includes('invalid_grant')) return null;
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  const refreshed = await res.json();
  // Google omits refresh_token on refresh — keep the original.
  saveTokens({ ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token }, TOKEN_NAME);
  return refreshed.access_token;
}

let cachedCalendar = null;

async function resolveCalendar(accessToken) {
  if (process.env.GOOGLE_CALENDAR_ID) {
    return { id: process.env.GOOGLE_CALENDAR_ID, name: null };
  }
  if (cachedCalendar) return cachedCalendar;

  const res = await fetch(`${API_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar list fetch failed: ${res.status}`);
  const { items = [] } = await res.json();

  const family = items.find(c => (c.summary ?? '').toLowerCase().includes('family'));
  const primary = items.find(c => c.primary);
  const chosen = family ?? primary ?? items[0];
  if (!chosen) throw new Error('No calendars found for this account');

  cachedCalendar = { id: chosen.id, name: chosen.summary };
  return cachedCalendar;
}

export async function getCalendarEvents() {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const calendar = await resolveCalendar(accessToken);

  const params = new URLSearchParams({
    maxResults: '3',
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: new Date().toISOString(),
  });
  const res = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Events fetch failed: ${res.status}`);
  const { items = [] } = await res.json();

  const events = items.map(e => ({
    name: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? null,
    allDay: !e.start?.dateTime,
  }));

  return { calendarName: calendar.name, events };
}
