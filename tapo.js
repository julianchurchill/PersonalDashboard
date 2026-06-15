import { loginDeviceByIp } from 'tp-link-tapo-connect';

// TAPO_DEVICES is a comma-separated list of devices, each either a bare IP
// (the device's own nickname is used as the label) or "Label=IP".
function parseDevices() {
  return (process.env.TAPO_DEVICES ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const eq = entry.indexOf('=');
      return eq === -1
        ? { label: null, ip: entry }
        : { label: entry.slice(0, eq).trim(), ip: entry.slice(eq + 1).trim() };
    });
}

export function isTapoConfigured() {
  return !!(process.env.TAPO_EMAIL && process.env.TAPO_PASSWORD && process.env.TAPO_DEVICES);
}

function isKnownDevice(ip) {
  return parseDevices().some(d => d.ip === ip);
}

// An offline device can leave a TCP connection hanging for a long time, so cap
// every device operation — one slow device must not stall the whole widget.
const OP_TIMEOUT_MS = 6000;

function withTimeout(promise, ms = OP_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('device timed out')), ms)),
  ]);
}

// Logging in performs a full handshake, so cache the device handle per IP and
// only re-login when a call fails (the session may have expired).
const handles = new Map();

async function getHandle(ip, forceNew = false) {
  if (!forceNew && handles.has(ip)) return handles.get(ip);
  const handle = await loginDeviceByIp(process.env.TAPO_EMAIL, process.env.TAPO_PASSWORD, ip);
  handles.set(ip, handle);
  return handle;
}

// After a failed login we hold off re-attempting for a growing backoff window.
// Tapo devices return HTTP 403 to the login handshake after repeated failures,
// so retrying on every poll can trigger — or prolong — a device-side lockout.
const BACKOFF_BASE_MS = 60_000;          // 1 min after the first failure
const BACKOFF_MAX_MS = 15 * 60_000;      // capped at 15 min
const failures = new Map();              // ip -> { until, attempts, error, status }

function activeBackoff(ip) {
  const f = failures.get(ip);
  return f && Date.now() < f.until ? f : null;
}

function recordFailure(ip, error) {
  const attempts = (failures.get(ip)?.attempts ?? 0) + 1;
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1));
  const status = classifyError(error);
  failures.set(ip, { until: Date.now() + delay, attempts, error, status });
  return status;
}

function clearFailure(ip) {
  failures.delete(ip);
}

// Map a raw error to a coarse status the widget can present meaningfully.
function classifyError(message = '') {
  if (/\b403\b/.test(message)) return 'refused';   // device rejected the login (locked, or not permitted)
  if (/timed out|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ECONNREFUSED|ENOTFOUND|EHOSTDOWN/.test(message)) return 'offline';
  return 'error';
}

function decodeNickname(nickname) {
  if (!nickname) return null;
  try {
    return Buffer.from(nickname, 'base64').toString('utf8');
  } catch {
    return nickname;
  }
}

function deviceType(model) {
  const m = (model ?? '').toUpperCase();
  if (m.startsWith('L')) return 'light';
  if (m.startsWith('P')) return 'plug';
  return 'device';
}

async function readDevice({ label, ip }) {
  // While backing off from a failed login, report the cached failure straight
  // away rather than hitting the device again.
  const backoff = activeBackoff(ip);
  if (backoff) {
    return {
      ip, name: label || ip, on: null, type: 'device', reachable: false,
      status: backoff.status, error: backoff.error,
      retryInMs: backoff.until - Date.now(),
    };
  }

  try {
    const handle = await withTimeout(getHandle(ip));
    const info = await withTimeout(handle.getDeviceInfo());
    clearFailure(ip);
    return {
      ip,
      name: label || decodeNickname(info.nickname) || ip,
      on: !!info.device_on,
      type: deviceType(info.model),
      model: info.model ?? null,
      reachable: true,
      status: 'ok',
    };
  } catch (err) {
    handles.delete(ip);
    const status = recordFailure(ip, err.message);
    return { ip, name: label || ip, on: null, type: 'device', reachable: false, status, error: err.message };
  }
}

export async function getTapoStatus() {
  return Promise.all(parseDevices().map(readDevice));
}

export async function setTapoState(ip, on) {
  if (!isKnownDevice(ip)) throw new Error(`Unknown device: ${ip}`);
  // A toggle is an explicit user action, so always attempt it even if we are
  // currently backing off — and let success clear the backoff.
  clearFailure(ip);
  try {
    try {
      const handle = await withTimeout(getHandle(ip));
      await withTimeout(on ? handle.turnOn() : handle.turnOff());
    } catch {
      // Session may have expired — retry once with a fresh login.
      const handle = await withTimeout(getHandle(ip, true));
      await withTimeout(on ? handle.turnOn() : handle.turnOff());
    }
  } catch (err) {
    handles.delete(ip);
    recordFailure(ip, err.message);
    throw err;
  }
  clearFailure(ip);
  return { ip, on };
}
