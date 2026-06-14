import { createHash } from 'crypto';

const DIRECTOR = 'https://director.myenergi.net';

let _cachedServer = null;

export function isMyenergiConfigured() {
  return !!(process.env.MYENERGI_SERIAL && process.env.MYENERGI_API_KEY);
}

function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

function parseDigestChallenge(header) {
  const get = (key) =>
    header.match(new RegExp(`${key}="([^"]+)"`))?.[1] ??
    header.match(new RegExp(`${key}=([^,\\s]+)`))?.[1];
  return { realm: get('realm'), nonce: get('nonce'), qop: get('qop'), opaque: get('opaque') };
}

function buildDigestHeader(serial, password, uri, challenge) {
  const { realm, nonce, qop, opaque } = parseDigestChallenge(challenge);
  const ha1 = md5(`${serial}:${realm}:${password}`);
  const ha2 = md5(`GET:${uri}`);
  const nc = '00000001';
  const cnonce = md5(Date.now().toString()).slice(0, 16);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `Digest username="${serial}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (qop)    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (opaque) parts.push(`opaque="${opaque}"`);
  return parts.join(', ');
}

async function getServer() {
  if (_cachedServer) return _cachedServer;
  const res = await fetch(`${DIRECTOR}/cgi-jstatus-*`);
  const asn = res.headers.get('X-myenergi-asn');
  _cachedServer = asn ? `https://${asn}` : DIRECTOR;
  return _cachedServer;
}

async function apiGet(path) {
  const serial   = process.env.MYENERGI_SERIAL;
  const password = process.env.MYENERGI_API_KEY;

  const server = await getServer();
  const url    = `${server}${path}`;
  const uri    = new URL(url).pathname;

  const r1 = await fetch(url);
  if (r1.status !== 401) {
    if (r1.ok) return r1.json();
    throw new Error(`myenergi API error: ${r1.status}`);
  }

  const challenge = r1.headers.get('WWW-Authenticate');
  if (!challenge?.startsWith('Digest')) throw new Error('Unexpected auth scheme from myenergi');

  const auth = buildDigestHeader(serial, password, uri, challenge);
  const r2 = await fetch(url, { headers: { Authorization: auth } });
  if (!r2.ok) throw new Error(`myenergi API error after auth: ${r2.status}`);
  return r2.json();
}

const ZAPPI_STATUS = { 1: 'Paused', 3: 'Diverting', 4: 'Boosting', 5: 'Complete', 6: 'Fault' };
const ZAPPI_MODE   = { 1: 'Fast', 2: 'Eco', 3: 'Eco+', 4: 'Stopped' };

export async function getMyenergiStatus() {
  const data = await apiGet('/cgi-jstatus-*');

  const zappi = data.zappi?.[0];
  if (!zappi) throw new Error('No Zappi found on myenergi account');

  // grd: positive = importing from grid, negative = exporting to grid
  return {
    solarW:     Math.round(zappi.gen  ?? 0),
    gridW:      Math.round(zappi.grd  ?? 0),
    chargeW:    Math.round(zappi.div  ?? 0),
    sessionKwh: zappi.che  ?? 0,
    status:     ZAPPI_STATUS[zappi.sta] ?? 'Unknown',
    mode:       ZAPPI_MODE[zappi.zmo]  ?? 'Unknown',
    plugged:    zappi.pst !== 'A',
  };
}
