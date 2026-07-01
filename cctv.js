import { spawn } from 'child_process';

const CHANNELS = 4;
const BASE_FPS = 1;                     // frames/sec for a channel shown in the grid/focus
const BOOST_FPS = 10;                   // frames/sec for the single full-screen ("super zoom") channel
const RESTART_MS = 2_000;               // pause before reconnecting a dropped stream
const MAX_BUFFER = 4 * 1024 * 1024;     // drop the accumulator if a frame never completes

const SOI = Buffer.from([0xFF, 0xD8]);  // JPEG start-of-image marker
const EOI = Buffer.from([0xFF, 0xD9]);  // JPEG end-of-image marker

export function isCctvConfigured() {
  return !!(process.env.CCTV_IP && process.env.CCTV_PASSWORD);
}

const cache = new Map();    // channel -> Buffer (latest JPEG)
const streams = new Map();  // channel -> { proc } (current ffmpeg for the channel)
let boostedChannel = null;  // the full-screen channel, pulled at BOOST_FPS

function rtspUrl(channel) {
  const { CCTV_IP: ip, CCTV_PASSWORD: pwd } = process.env;
  const user = process.env.CCTV_USER ?? 'admin';
  const port = process.env.CCTV_RTSP_PORT ?? '554';
  return `rtsp://${ip}:${port}/user=${user}&password=${pwd}&channel=${channel}&stream=0.sdp`;
}

export function getSnapshot(channel) {
  return cache.get(channel) ?? null;
}

function fpsFor(channel) {
  return channel === boostedChannel ? BOOST_FPS : BASE_FPS;
}

// Keep one long-lived ffmpeg per channel with the RTSP connection open, emitting
// JPEGs at the channel's current fps. Spawning a fresh ffmpeg per snapshot
// instead paid a full RTSP handshake + keyframe wait every time, and doing that
// for four channels at once made the DVR stall for 10s+. A steady stream avoids
// both. Decoding runs continuously regardless of fps, so a higher fps only costs
// extra JPEG encoding — cheap enough to boost the one full-screen channel.
//
// ffmpeg writes the frames back-to-back on stdout, so we split them on the JPEG
// SOI/EOI markers and keep only the most recent per channel. If ffmpeg exits
// (stream drop, network blip) we reconnect after a short pause.
function streamChannel(channel) {
  const proc = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-i', rtspUrl(channel),
    '-vf', `fps=${fpsFor(channel)}`,
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', '5',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] });

  const entry = { proc };
  streams.set(channel, entry);

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

  // 'error' (spawn failed) and 'close' (process exited) can both fire; only act
  // once, and only reconnect if this is still the channel's active stream — a
  // boost change deliberately replaces it and spawns its own replacement.
  let handled = false;
  const onExit = () => {
    if (handled) return;
    handled = true;
    if (streams.get(channel) === entry) {
      setTimeout(() => streamChannel(channel), RESTART_MS);
    }
  };
  proc.on('error', onExit);
  proc.on('close', onExit);
}

// Boost a single channel to BOOST_FPS (for the full-screen view) and return the
// others to BASE_FPS. Pass null to clear. Only the channels whose fps actually
// changes are restarted.
export function setCctvBoost(channel) {
  const next = Number.isInteger(channel) && channel >= 1 && channel <= CHANNELS ? channel : null;
  if (next === boostedChannel) return boostedChannel;

  const affected = [boostedChannel, next].filter(c => c != null);
  boostedChannel = next;

  for (const ch of affected) {
    const entry = streams.get(ch);
    if (entry) {
      streams.delete(ch);          // detach so its onExit won't auto-respawn
      entry.proc.kill('SIGKILL');
    }
    streamChannel(ch);             // respawn immediately at the new fps
  }
  return boostedChannel;
}

if (isCctvConfigured()) {
  for (let ch = 1; ch <= CHANNELS; ch++) streamChannel(ch);
}
