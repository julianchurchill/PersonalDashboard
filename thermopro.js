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
