// ThermoPro TP357/TP358/TP359 Bluetooth temperature & humidity monitors.
//
// These models broadcast their readings in the BLE advertisement (manufacturer
// data) — no pairing or connection is needed. We passively scan with noble and
// keep the latest reading per device in memory, then expose configured devices
// via getThermoproStatus(). This mirrors the CCTV widget: a background loop
// gathers data, the HTTP route just reads the cache.
//
// THERMOPRO_DEVICES is a comma-separated list, each entry either a bare MAC
// address (the BLE local name is used as the label) or "Label=MAC", e.g.
//   THERMOPRO_DEVICES=Bedroom=ab:cd:ef:01:23:45,Garage=ab:cd:ef:01:23:46

const STALE_MS = 10 * 60_000;            // a reading older than this is "offline"

function normaliseMac(mac) {
  return (mac ?? '').trim().toLowerCase();
}

function parseDevices() {
  return (process.env.THERMOPRO_DEVICES ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const eq = entry.indexOf('=');
      return eq === -1
        ? { label: null, mac: normaliseMac(entry) }
        : { label: entry.slice(0, eq).trim(), mac: normaliseMac(entry.slice(eq + 1)) };
    });
}

export function isThermoproConfigured() {
  return !!process.env.THERMOPRO_DEVICES;
}

// mac -> { tempC, humidity, rssi, lastSeen }
const readings = new Map();

// If the Bluetooth stack can't start (no adapter, missing permissions, noble
// failed to load) we record it here so the widget can show a clear reason
// rather than every device silently appearing offline forever.
let bleError = null;

export function getThermoproError() {
  return bleError;
}

// TP357/TP358/TP359 advertisement manufacturer data layout (bytes):
//   [0..1] company id   [2..3] temperature, int16 LE, /10 (°C)   [4] humidity %
// Matches the Theengs / OpenMQTTGateway "TP357_TP359" decoder.
function decode(manufacturerData) {
  if (!manufacturerData || manufacturerData.length < 5) return null;
  const tempC = manufacturerData.readInt16LE(2) / 10;
  const humidity = manufacturerData.readUInt8(4);
  // Sanity-check the decoded values so a non-ThermoPro broadcaster that happens
  // to match our heuristics can't inject nonsense readings.
  if (tempC < -40 || tempC > 85 || humidity > 100) return null;
  return { tempC, humidity };
}

function looksLikeThermopro(peripheral) {
  const name = peripheral.advertisement?.localName ?? '';
  return /^TP3\d\d/i.test(name);
}

const loggedDiscoveries = new Set();

function onDiscover(peripheral) {
  if (!looksLikeThermopro(peripheral)) return;
  const decoded = decode(peripheral.advertisement?.manufacturerData);
  if (!decoded) return;

  const mac = normaliseMac(peripheral.address);
  readings.set(mac, { ...decoded, rssi: peripheral.rssi, lastSeen: Date.now() });

  // Log each device once so the MAC can be copied into THERMOPRO_DEVICES.
  if (!loggedDiscoveries.has(mac)) {
    loggedDiscoveries.add(mac);
    const name = peripheral.advertisement?.localName ?? 'TP3xx';
    console.log(`ThermoPro discovered: ${name} ${mac || '(no address)'} — ` +
      `${decoded.tempC}°C ${decoded.humidity}%`);
  }
}

async function startScanning() {
  let noble;
  try {
    // Dynamic import so a host without Bluetooth (or noble's native build)
    // doesn't take down the rest of the dashboard at startup.
    noble = (await import('@abandonware/noble')).default;
  } catch (err) {
    bleError = `Bluetooth unavailable: ${err.message}`;
    console.error('ThermoPro:', bleError);
    return;
  }

  noble.on('stateChange', async state => {
    if (state === 'poweredOn') {
      bleError = null;
      try {
        // Allow duplicates so repeated broadcasts keep readings fresh.
        await noble.startScanningAsync([], true);
      } catch (err) {
        bleError = `Could not start BLE scan: ${err.message}`;
        console.error('ThermoPro:', bleError);
      }
    } else {
      bleError = `Bluetooth adapter not ready (state: ${state})`;
      console.warn('ThermoPro:', bleError);
    }
  });

  noble.on('discover', onDiscover);
}

export async function getThermoproStatus() {
  const now = Date.now();
  return parseDevices().map(({ label, mac }) => {
    const r = readings.get(mac);
    const fresh = r && now - r.lastSeen < STALE_MS;
    return {
      mac,
      name: label || mac,
      reachable: !!fresh,
      tempC: fresh ? r.tempC : null,
      humidity: fresh ? r.humidity : null,
      rssi: fresh ? r.rssi : null,
      lastSeen: r?.lastSeen ?? null,
    };
  });
}

if (isThermoproConfigured()) startScanning();
