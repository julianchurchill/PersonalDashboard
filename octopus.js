const API_BASE = 'https://api.octopus.energy/v1';

let _cachedProductCode = null;
let _productCodeFetchedAt = 0;
let _cachedAccountData = null;
let _accountDataFetchedAt = 0;
const PRODUCT_TTL_MS = 24 * 60 * 60 * 1000;

async function getAccountData() {
  if (_cachedAccountData && Date.now() - _accountDataFetchedAt < PRODUCT_TTL_MS) {
    return _cachedAccountData;
  }
  const { OCTOPUS_API_KEY: apiKey, OCTOPUS_ACCOUNT_NUMBER: accountNumber } = process.env;
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');
  const res = await fetch(`${API_BASE}/accounts/${accountNumber}/`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Account fetch failed: ${res.status}`);
  _cachedAccountData = await res.json();
  _accountDataFetchedAt = Date.now();
  return _cachedAccountData;
}

async function getRegion() {
  const data = await getAccountData();
  const now = new Date();
  const tariffCode = [
    ...(data.properties?.flatMap(p => p.electricity_meter_points ?? []) ?? []),
    ...(data.properties?.flatMap(p => p.gas_meter_points ?? []) ?? []),
  ]
    .flatMap(m => m.agreements ?? [])
    .find(a => new Date(a.valid_from) <= now && (!a.valid_to || new Date(a.valid_to) > now))
    ?.tariff_code;

  if (!tariffCode) throw new Error('No active tariff found to determine region');
  const match = /^[EG]-1R-.+-([A-Z])$/.exec(tariffCode);
  if (!match) throw new Error(`Could not determine region from tariff code: ${tariffCode}`);
  return match[1];
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

async function getGasProductCode() {
  const data = await getAccountData();
  const now = new Date();
  const tariffCode = data.properties
    ?.flatMap(p => p.gas_meter_points ?? [])
    ?.flatMap(m => m.agreements ?? [])
    ?.find(a => new Date(a.valid_from) <= now && (!a.valid_to || new Date(a.valid_to) > now))
    ?.tariff_code;

  if (!tariffCode) throw new Error('No active gas tariff found on account');
  const match = /^G-1R-(.+)-[A-Z]$/.exec(tariffCode);
  if (!match) throw new Error(`Unexpected gas tariff code format: ${tariffCode}`);
  return match[1];
}

async function fetchStandingCharge(productCode, tariffType, tariffCode) {
  const url = `${API_BASE}/products/${productCode}/${tariffType}-tariffs/${tariffCode}/standing-charges/?page_size=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Standing charges fetch failed: ${res.status} (tariff: ${tariffCode})`);
  const data = await res.json();
  const now = new Date();
  const current = (data.results ?? []).find(r =>
    new Date(r.valid_from) <= now && (!r.valid_to || new Date(r.valid_to) > now)
  );
  return current?.value_inc_vat ?? null;
}

export function isGasConfigured() {
  return !!(process.env.OCTOPUS_API_KEY && process.env.OCTOPUS_ACCOUNT_NUMBER);
}

export async function getGasRate() {
  const [productCode, region] = await Promise.all([getGasProductCode(), getRegion()]);
  const tariffCode = `G-1R-${productCode}-${region}`;

  const ratesUrl = `${API_BASE}/products/${productCode}/gas-tariffs/${tariffCode}/standard-unit-rates/?page_size=5`;
  const [ratesRes, standingCharge] = await Promise.all([
    fetch(ratesUrl),
    fetchStandingCharge(productCode, 'gas', tariffCode),
  ]);

  if (!ratesRes.ok) throw new Error(`Gas rates fetch failed: ${ratesRes.status} (tariff: ${tariffCode})`);
  const data = await ratesRes.json();

  const now = new Date();
  const current = (data.results ?? []).find(r =>
    new Date(r.valid_from) <= now && (!r.valid_to || new Date(r.valid_to) > now)
  );
  if (!current) throw new Error('No current gas rate found');

  return {
    rate: current.value_inc_vat,
    validFrom: current.valid_from,
    validTo: current.valid_to,
    standingCharge,
  };
}

export async function getUpcomingRates() {
  const [productCode, region] = await Promise.all([getAgileProductCode(), getRegion()]);
  const tariffCode = `E-1R-${productCode}-${region}`;

  const now = new Date();
  const slotStart = new Date(now);
  slotStart.setMinutes(Math.floor(slotStart.getMinutes() / 30) * 30, 0, 0);
  const periodEnd = new Date(slotStart.getTime() + 24 * 60 * 60 * 1000);

  const url = `${API_BASE}/products/${productCode}/electricity-tariffs/${tariffCode}/standard-unit-rates/` +
    `?period_from=${slotStart.toISOString()}&period_to=${periodEnd.toISOString()}&page_size=48`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Rates fetch failed: ${res.status} (tariff: ${tariffCode})`);
  const data = await res.json();

  return (data.results ?? [])
    .sort((a, b) => new Date(a.valid_from) - new Date(b.valid_from))
    .slice(0, 48)
    .map(r => ({
      rate: r.value_inc_vat,
      validFrom: r.valid_from,
      validTo: r.valid_to,
    }));
}

export async function getCurrentRate() {
  const [productCode, region] = await Promise.all([getAgileProductCode(), getRegion()]);
  const tariffCode = `E-1R-${productCode}-${region}`;

  const now = new Date();
  const slotStart = new Date(now);
  slotStart.setMinutes(Math.floor(slotStart.getMinutes() / 30) * 30, 0, 0);
  const twoSlotsEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

  const ratesUrl = `${API_BASE}/products/${productCode}/electricity-tariffs/${tariffCode}/standard-unit-rates/` +
    `?period_from=${slotStart.toISOString()}&period_to=${twoSlotsEnd.toISOString()}`;

  const [ratesRes, standingCharge] = await Promise.all([
    fetch(ratesUrl),
    fetchStandingCharge(productCode, 'electricity', tariffCode),
  ]);

  if (!ratesRes.ok) throw new Error(`Rates fetch failed: ${ratesRes.status} (tariff: ${tariffCode})`);
  const data = await ratesRes.json();

  const results = (data.results ?? []).sort(
    (a, b) => new Date(a.valid_from) - new Date(b.valid_from)
  );
  if (!results.length) throw new Error('No rate available for current period');

  const current = results[0];
  const next = results[1] ?? null;

  return {
    rate: current.value_inc_vat,
    validFrom: current.valid_from,
    validTo: current.valid_to,
    standingCharge,
    ...(next ? {
      nextRate: next.value_inc_vat,
      nextValidFrom: next.valid_from,
      nextValidTo: next.valid_to,
    } : {}),
  };
}
