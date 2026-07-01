// ThermoPro TP357/TP358/TP359 temperature & humidity monitors, read via an
// ESP32 BLE proxy.
//
// The monitors broadcast their readings over Bluetooth LE, but the dashboard
// runs in Docker (Docker Desktop) with no access to a Bluetooth adapter. So a
// cheap ESP32 running ESPHome sits near the sensors, decodes their broadcasts,
// and exposes each value over its built-in HTTP web server. The dashboard just
// polls those JSON endpoints — same as every other widget. See the README for
// the ESPHome configuration that produces these endpoints.
//
// THERMOPRO_SENSORS is a comma-separated list of sensors, each:
//   Label=<temperatureUrl>;<humidityUrl>
// where the two URLs are ESPHome REST endpoints, e.g.
//   Ollie=http://192.168.0.30/sensor/ollie_temperature;http://192.168.0.30/sensor/ollie_humidity
// The humidity URL is optional (omit the ";..." for a temperature-only sensor).

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const OP_TIMEOUT_MS = 4000;              // cap each HTTP read so one slow ESP32 can't stall the widget

function parseSensors() {
  return (process.env.THERMOPRO_SENSORS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const eq = entry.indexOf('=');
      const label = eq === -1 ? null : entry.slice(0, eq).trim();
      const urls = (eq === -1 ? entry : entry.slice(eq + 1)).trim();
      const [tempUrl, humUrl] = urls.split(';').map(u => u.trim());
      return { label: label || tempUrl, tempUrl, humUrl: humUrl || null };
    })
    .filter(s => s.tempUrl);
}

export function isThermoproConfigured() {
  return !!process.env.THERMOPRO_SENSORS;
}

// Fetch one ESPHome REST endpoint and return its numeric value, or null if the
// endpoint is unreachable or reports a non-numeric state (e.g. "nan" when the
// underlying sensor hasn't been seen). ESPHome responds with
//   {"id":"sensor-ollie_temperature","value":21.4,"state":"21.4 °C"}
async function fetchValue(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    // ESPHome reports an unknown/unavailable sensor as {"value":null,"state":"NA"};
    // guard against it explicitly, since Number(null) is 0 (a finite number).
    if (data.value == null) return null;
    const value = Number(data.value);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readSensor({ label, tempUrl, humUrl }) {
  const [tempC, humidity] = await Promise.all([fetchValue(tempUrl), fetchValue(humUrl)]);
  return {
    name: label,
    // A sensor is "reachable" once we have a temperature; humidity is optional.
    reachable: tempC != null,
    tempC,
    humidity,
  };
}

export async function getThermoproStatus() {
  return Promise.all(parseSensors().map(readSensor));
}

// --- 24-hour history --------------------------------------------------------
//
// ESPHome only reports the current value, so to graph a sensor over time we
// sample it here on a fixed interval and keep a rolling in-memory series per
// sensor (keyed by its label). The series is persisted to the data volume so
// it survives container restarts and redeploys.

const SAMPLE_INTERVAL_MS = 5 * 60_000;        // one sample every 5 minutes
const RETENTION_MS = 24 * 60 * 60_000;        // keep 24 hours

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');
const HISTORY_FILE = join(DATA_DIR, 'thermopro-history.json');

const history = new Map();                     // name -> [{ t, tempC, humidity }]

function loadHistory() {
  try {
    const raw = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
    const cutoff = Date.now() - RETENTION_MS;
    for (const [name, series] of Object.entries(raw)) {
      if (Array.isArray(series)) history.set(name, series.filter(p => p && p.t >= cutoff));
    }
  } catch { /* no or unreadable history file — start empty */ }
}

function saveHistory() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(history)));
  } catch { /* best-effort — a failed write just means we re-sample after restart */ }
}

function recordSample(name, tempC, humidity) {
  let series = history.get(name);
  if (!series) { series = []; history.set(name, series); }
  series.push({ t: Date.now(), tempC, humidity });
  const cutoff = Date.now() - RETENTION_MS;
  while (series.length && series[0].t < cutoff) series.shift();
}

async function sampleAll() {
  const readings = await getThermoproStatus();
  for (const r of readings) {
    // Only record real readings; an offline sensor leaves a gap in its series.
    if (r.tempC != null) recordSample(r.name, r.tempC, r.humidity);
  }
  saveHistory();
}

async function runSamplerLoop() {
  while (true) {
    try { await sampleAll(); } catch { /* keep sampling on the next tick */ }
    await new Promise(r => setTimeout(r, SAMPLE_INTERVAL_MS));
  }
}

export function getThermoproHistory(name) {
  const cutoff = Date.now() - RETENTION_MS;
  return (history.get(name) ?? []).filter(p => p.t >= cutoff);
}

if (isThermoproConfigured()) {
  loadHistory();
  runSamplerLoop();
}
