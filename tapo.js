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
  try {
    const handle = await withTimeout(getHandle(ip));
    const info = await withTimeout(handle.getDeviceInfo());
    return {
      ip,
      name: label || decodeNickname(info.nickname) || ip,
      on: !!info.device_on,
      type: deviceType(info.model),
      model: info.model ?? null,
      reachable: true,
    };
  } catch (err) {
    handles.delete(ip);
    return { ip, name: label || ip, on: null, type: 'device', reachable: false, error: err.message };
  }
}

export async function getTapoStatus() {
  return Promise.all(parseDevices().map(readDevice));
}

export async function setTapoState(ip, on) {
  if (!isKnownDevice(ip)) throw new Error(`Unknown device: ${ip}`);
  try {
    const handle = await withTimeout(getHandle(ip));
    await withTimeout(on ? handle.turnOn() : handle.turnOff());
  } catch {
    // Session may have expired — retry once with a fresh login.
    const handle = await withTimeout(getHandle(ip, true));
    await withTimeout(on ? handle.turnOn() : handle.turnOff());
  }
  return { ip, on };
}
