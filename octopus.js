const API_BASE = 'https://api.octopus.energy/v1';

let _cachedProductCode = null;
let _productCodeFetchedAt = 0;
const PRODUCT_TTL_MS = 24 * 60 * 60 * 1000;

function getRegion() {
  return (process.env.OCTOPUS_REGION || 'C').toUpperCase();
}

async function getAgileProductCode() {
  if (_cachedProductCode && Date.now() - _productCodeFetchedAt < PRODUCT_TTL_MS) {
    return _cachedProductCode;
  }

  const now = new Date().toISOString();
  let nextUrl = `${API_BASE}/products/?brand=OCTOPUS_ENERGY&is_variable=true&page_size=100`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
    const data = await res.json();

    const agile = (data.results ?? [])
      .filter(p => p.code.startsWith('AGILE') && (!p.available_to || p.available_to > now))
      .sort((a, b) => b.available_from.localeCompare(a.available_from))[0];

    if (agile) {
      _cachedProductCode = agile.code;
      _productCodeFetchedAt = Date.now();
      return _cachedProductCode;
    }

    nextUrl = data.next ?? null;
  }

  throw new Error('No active Agile product found');
}

export async function getCurrentRate() {
  const productCode = await getAgileProductCode();
  const region = getRegion();
  const tariffCode = `E-1R-${productCode}-${region}`;

  const now = new Date();
  const slotStart = new Date(now);
  slotStart.setMinutes(Math.floor(slotStart.getMinutes() / 30) * 30, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

  const url = `${API_BASE}/products/${productCode}/electricity-tariffs/${tariffCode}/standard-unit-rates/` +
    `?period_from=${slotStart.toISOString()}&period_to=${slotEnd.toISOString()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Rates fetch failed: ${res.status} (tariff: ${tariffCode})`);
  const data = await res.json();

  const results = data.results ?? [];
  if (!results.length) throw new Error('No rate available for current period');

  return {
    rate: results[0].value_inc_vat,
    validFrom: results[0].valid_from,
    validTo: results[0].valid_to,
  };
}
