import { spawn } from 'child_process';

const CHANNELS = 4;
const REFRESH_MS = 15_000;
const TIMEOUT_MS = 12_000;

export function isCctvConfigured() {
  return !!(process.env.CCTV_IP && process.env.CCTV_PASSWORD);
}

const cache = new Map(); // channel -> Buffer

function rtspUrl(channel) {
  const { CCTV_IP: ip, CCTV_PASSWORD: pwd } = process.env;
  const user = process.env.CCTV_USER ?? 'admin';
  const port = process.env.CCTV_RTSP_PORT ?? '554';
  return `rtsp://${ip}:${port}/user=${user}&password=${pwd}&channel=${channel}&stream=0.sdp`;
}

function captureFrame(channel) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const proc = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-rtsp_transport', 'tcp',
      '-i', rtspUrl(channel),
      '-vframes', '1',
      '-f', 'image2',
      '-vcodec', 'mjpeg',
      '-q:v', '5',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('timeout')); }, TIMEOUT_MS);

    proc.stdout.on('data', d => chunks.push(d));
    proc.on('close', () => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) resolve(buf);
      else reject(new Error('no output'));
    });
    proc.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

export function getSnapshot(channel) {
  return cache.get(channel) ?? null;
}

async function refreshAll() {
  await Promise.allSettled(
    Array.from({ length: CHANNELS }, (_, i) => i + 1).map(async ch => {
      try {
        const data = await captureFrame(ch);
        cache.set(ch, data);
      } catch { /* retain previous frame on failure */ }
    })
  );
}

async function runRefreshLoop() {
  while (true) {
    await refreshAll();
    await new Promise(r => setTimeout(r, REFRESH_MS));
  }
}

if (isCctvConfigured()) runRefreshLoop();
