import { createHash, publicEncrypt, createCipheriv, createDecipheriv, randomBytes, constants, createPublicKey } from 'crypto';
import { request as httpsRequest } from 'https';

export function isDecoConfigured() {
  return !!(process.env.DECO_IP && process.env.DECO_PASSWORD);
}

let _session = null;

// Random 16-digit decimal string (no leading zero) — used as AES key / IV
function randomDigits() {
  const buf = randomBytes(8);
  const val = (BigInt('0x' + buf.toString('hex')) % 9_000_000_000_000_000n) + 1_000_000_000_000_000n;
  return val.toString();
}

function md5(str) {
  return createHash('md5').update(str).digest('hex');
}

// Build a Node KeyObject from raw RSA (n, e) hex strings
function buildRsaKey(n_hex, e_hex) {
  return createPublicKey({
    key: {
      kty: 'RSA',
      n: Buffer.from(n_hex, 'hex').toString('base64url'),
      e: Buffer.from(e_hex, 'hex').toString('base64url'),
    },
    format: 'jwk',
  });
}

// RSA PKCS1-v1_5 encrypt, block-split, return concatenated hex
function rsaEncrypt(n_hex, e_hex, plaintext) {
  const key = buildRsaKey(n_hex, e_hex);
  const blockSize = Buffer.from(n_hex, 'hex').length - 11;
  const buf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  let out = '';
  for (let i = 0; i < buf.length; i += blockSize) {
    out += publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, buf.subarray(i, i + blockSize)).toString('hex');
  }
  return out;
}

// AES-128-CBC with PKCS7, key/IV are the 16-char digit strings as UTF-8 bytes
function aesEncrypt(plaintext, keyStr, ivStr) {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(keyStr, 'utf8'), Buffer.from(ivStr, 'utf8'));
  return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64');
}

function aesDecrypt(b64, keyStr, ivStr) {
  const decipher = createDecipheriv('aes-128-cbc', Buffer.from(keyStr, 'utf8'), Buffer.from(ivStr, 'utf8'));
  return Buffer.concat([decipher.update(Buffer.from(b64, 'base64')), decipher.final()]).toString('utf8');
}

// HTTPS POST, skipping self-signed cert validation
function post(ip, path, body, extraHeaders = {}) {
  const isJson = typeof body !== 'string';
  const bodyBuf = Buffer.from(isJson ? JSON.stringify(body) : body, 'utf8');

  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      hostname: ip, port: 443, path, method: 'POST',
      headers: {
        'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
        'Content-Length': bodyBuf.length,
        ...extraHeaders,
      },
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      const setCookie = res.headers['set-cookie'] ?? [];
      res.on('data', c => data += c);
      res.on('end', () => {
        const cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        try { resolve({ json: JSON.parse(data), cookies }); }
        catch  { resolve({ json: null, raw: data, cookies }); }
      });
    });
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

function encodePayload(payload, aesKey, aesIv, signN, signE, authHash, seq) {
  const data    = aesEncrypt(JSON.stringify(payload), aesKey, aesIv);
  const dataLen = data.length;
  const signText = `k=${aesKey}&i=${aesIv}&h=${authHash}&s=${seq + dataLen}`;
  const sign     = rsaEncrypt(signN, signE, signText);
  return { body: `sign=${sign}&data=${encodeURIComponent(data)}`, dataLen };
}

async function login() {
  const ip       = process.env.DECO_IP;
  const password = process.env.DECO_PASSWORD;
  const username = 'admin';

  const aesKey = randomDigits();
  const aesIv  = randomDigits();

  const keysRes = await post(ip, '/cgi-bin/luci/;stok=/login?form=keys', { operation: 'read' });
  if (keysRes.json?.error_code !== 0) throw new Error(`Deco keys: ${JSON.stringify(keysRes.json)}`);
  const [passN, passE] = keysRes.json.result.password;

  const authRes = await post(ip, '/cgi-bin/luci/;stok=/login?form=auth', { operation: 'read' });
  if (authRes.json?.error_code !== 0) throw new Error(`Deco auth: ${JSON.stringify(authRes.json)}`);
  const [signN, signE] = authRes.json.result.key;
  let seq = authRes.json.result.seq;

  const encPass    = rsaEncrypt(passN, passE, password);
  const authHash   = md5(`${username}${password}`);
  const loginPayload = { username, password: encPass, operation: 'login' };
  const { body, dataLen } = encodePayload(loginPayload, aesKey, aesIv, signN, signE, authHash, seq);
  seq += dataLen;

  const loginRes = await post(ip, '/cgi-bin/luci/;stok=/login?form=login', body);
  if (!loginRes.json?.data) throw new Error(`Deco login failed: ${JSON.stringify(loginRes.json)}`);

  const loginData = JSON.parse(aesDecrypt(loginRes.json.data, aesKey, aesIv));
  if (loginData.error_code !== 0) throw new Error(`Deco login error code: ${loginData.error_code}`);

  return {
    stok: loginData.result?.stok ?? loginData.stok,
    sysauth: loginRes.cookies,
    aesKey, aesIv, signN, signE, authHash, seq,
    expiry: Date.now() + 5 * 60 * 1000,
  };
}

export function invalidateDecoSession() { _session = null; }

async function getSession() {
  if (_session && Date.now() < _session.expiry) return _session;
  _session = null;
  _session = await login();
  return _session;
}

async function apiPost(urlPath, payload) {
  const ip      = process.env.DECO_IP;
  const session = await getSession();
  const path    = `/cgi-bin/luci/;stok=${session.stok}${urlPath}`;
  const { body, dataLen } = encodePayload(payload, session.aesKey, session.aesIv,
    session.signN, session.signE, session.authHash, session.seq);

  const res = await post(ip, path, body, { Cookie: session.sysauth });
  session.seq += dataLen;

  if (!res.json?.data) throw new Error(`Deco API error: ${JSON.stringify(res.json)}`);
  return JSON.parse(aesDecrypt(res.json.data, session.aesKey, session.aesIv));
}

export async function getDecoStatus() {
  const data = await apiPost('/admin/client?form=client_list', {
    operation: 'read',
    params: { device_mac: 'default' },
  });

  console.log('Deco client_list response:', JSON.stringify(data));

  const clients    = data.result?.client_list ?? [];
  const online     = clients.filter(c => c.online !== false);
  const downloadBps = online.reduce((s, c) => s + (c.down_speed ?? 0), 0);
  const uploadBps   = online.reduce((s, c) => s + (c.up_speed ?? 0), 0);

  return {
    connectedDevices: online.length,
    downloadBps,
    uploadBps,
  };
}
