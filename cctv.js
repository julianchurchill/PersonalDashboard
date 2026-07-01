import { spawn } from 'child_process';

const CHANNELS = 4;
const FRAME_FPS = 1;                    // frames per second pulled from each stream
const RESTART_MS = 2_000;               // pause before reconnecting a dropped stream
const MAX_BUFFER = 4 * 1024 * 1024;     // drop the accumulator if a frame never completes

const SOI = Buffer.from([0xFF, 0xD8]);  // JPEG start-of-image marker
const EOI = Buffer.from([0xFF, 0xD9]);  // JPEG end-of-image marker

export function isCctvConfigured() {
  return !!(process.env.CCTV_IP && process.env.CCTV_PASSWORD);
}

const cache = new Map(); // channel -> Buffer (latest JPEG)

function rtspUrl(channel) {
  const { CCTV_IP: ip, CCTV_PASSWORD: pwd } = process.env;
  const user = process.env.CCTV_USER ?? 'admin';
  const port = process.env.CCTV_RTSP_PORT ?? '554';
  return `rtsp://${ip}:${port}/user=${user}&password=${pwd}&channel=${channel}&stream=0.sdp`;
}

export function getSnapshot(channel) {
  return cache.get(channel) ?? null;
}

// Keep one long-lived ffmpeg per channel with the RTSP connection open, emitting
// ~FRAME_FPS JPEGs a second. Spawning a fresh ffmpeg per snapshot instead paid a
// full RTSP handshake + keyframe wait every time, and doing that for four
// channels at once made the DVR stall for 10s+ — so the cache only refreshed
// every 7-15s however fast the browser polled. A steady stream avoids both.
//
// ffmpeg writes the frames back-to-back on stdout, so we split them on the JPEG
// SOI/EOI markers and keep only the most recent per channel. If ffmpeg exits
// (stream drop, network blip) we reconnect after a short pause.
function streamChannel(channel) {
  const proc = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl(channel),
    '-vf', `fps=${FRAME_FPS}`,
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', '5',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  let buf = Buffer.alloc(0);
  proc.stdout.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const start = buf.indexOf(SOI);
      if (start === -1) {
        if (buf.length > MAX_BUFFER) buf = Buffer.alloc(0);
        break;
      }
      const end = buf.indexOf(EOI, start + 2);
      if (end === -1) {
        if (start > 0) buf = buf.subarray(start);   // drop bytes before the frame start
        if (buf.length > MAX_BUFFER) buf = Buffer.alloc(0);
        break;
      }
      cache.set(channel, buf.subarray(start, end + 2));   // a complete JPEG
      buf = buf.subarray(end + 2);
    }
  });

  // 'error' (spawn failed) and 'close' (process exited) can both fire; only
  // schedule one reconnect.
  let reconnected = false;
  const reconnect = () => {
    if (reconnected) return;
    reconnected = true;
    setTimeout(() => streamChannel(channel), RESTART_MS);
  };
  proc.on('error', reconnect);
  proc.on('close', reconnect);
}

if (isCctvConfigured()) {
  for (let ch = 1; ch <= CHANNELS; ch++) streamChannel(ch);
}
