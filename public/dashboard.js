function updateClock() {
  const now = new Date();

  const timeEl = document.getElementById('time');
  timeEl.textContent = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateEl = document.getElementById('date');
  const datePart = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  dateEl.textContent = `${datePart} · ${timeZone}`;
}

updateClock();
setInterval(updateClock, 1000);

function weatherEmoji(code) {
  if (code <= 1)  return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 57) return '🌨️';
  if (code <= 65) return '🌧️';
  if (code <= 67) return '🧊';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '❄️';
  return '⛈️';
}

function renderWeather(data) {
  const el = document.getElementById('weather');

  if (data.status === 'unconfigured' || data.status === 'error') {
    el.replaceChildren();
    el.onclick = null;
    return;
  }

  const mainEl = document.createElement('div');
  mainEl.id = 'weather-main';
  mainEl.textContent = `${weatherEmoji(data.weatherCode)} ${data.temperature}°C`;

  const condEl = document.createElement('div');
  condEl.id = 'weather-condition';
  condEl.textContent = data.condition;

  el.replaceChildren(mainEl, condEl);
  el.onclick = () => window.open(data.url, '_blank');
}

async function loadWeather() {
  try {
    const res = await fetch('/api/weather');
    renderWeather(await res.json());
  } catch {
    document.getElementById('weather').replaceChildren();
  }
}

loadWeather();
setInterval(loadWeather, 30 * 60 * 1000);

async function loadVersion() {
  const res = await fetch('/api/version');
  const { version, datetime, hash } = await res.json();
  const d = new Date(datetime);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById('version-info').textContent = `v${version} · ${date} ${time} ${tz} · ${hash}`;
}

loadVersion();

function setBodyText(el, cssClass, text) {
  const span = document.createElement('span');
  span.className = cssClass;
  span.textContent = text;
  el.replaceChildren(span);
}

function makeZoneRow(z) {
  const heating = z.temperature != null && z.target != null && z.temperature < z.target;

  const indicator = document.createElement('span');
  indicator.className = `heating-indicator${heating ? ' on' : ''}`;

  const name = document.createElement('span');
  name.className = 'heating-name';
  name.textContent = z.name ?? '';

  const current = document.createElement('span');
  current.className = 'current';
  current.textContent = z.temperature != null ? `${z.temperature}°C` : '—';

  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.textContent = '→';

  const targetText = document.createTextNode(z.target != null ? `${z.target}°C` : '—');

  const temps = document.createElement('span');
  temps.className = 'heating-temps';
  temps.append(current, arrow, targetText);

  const row = document.createElement('div');
  row.className = 'heating-row';
  row.append(indicator, name, temps);
  return row;
}

function renderHeating(data) {
  const body = document.getElementById('heating-body');
  const modeEl = document.getElementById('heating-mode');
  const widget = document.getElementById('heating-widget');

  if (data.status === 'unconfigured') {
    modeEl.textContent = '';
    setBodyText(body, 'widget-error', 'RESIDEO_CLIENT_ID / RESIDEO_CLIENT_SECRET not set.');
    return;
  }

  if (data.status === 'unauthorized') {
    modeEl.textContent = '';
    setBodyText(body, 'widget-auth-prompt', 'Click to authorise');
    widget.classList.add('widget-clickable');
    widget.onclick = () => window.open('/auth/resideo', '_blank');
    return;
  }

  widget.classList.remove('widget-clickable');
  widget.onclick = null;

  if (data.status === 'error') {
    modeEl.textContent = '';
    setBodyText(body, 'widget-error', data.message ?? 'Unknown error');
    return;
  }

  modeEl.textContent = data.zones?.[0]?.mode ?? '';
  modeEl.className = 'widget-badge' + (data.zones?.[0]?.mode === 'Heat' ? ' active' : '');

  const zones = data.zones ?? [];
  if (!zones.length) {
    setBodyText(body, 'widget-loading', 'No devices found.');
    return;
  }

  body.replaceChildren(...zones.map(makeZoneRow));
}

async function loadHeating() {
  try {
    const res = await fetch('/api/heating');
    renderHeating(await res.json());
  } catch {
    setBodyText(document.getElementById('heating-body'), 'widget-error', 'Could not reach heating API.');
  }
}

loadHeating();
setInterval(loadHeating, 60_000);

const PRICE_LEVEL_COLORS = {
  'negative':       '#6c8ebf',
  'cheap':          '#4caf82',
  'normal':         '#e8eaf0',
  'expensive':      '#e0a040',
  'very-expensive': '#c0616a',
};

function getPriceLevel(pence) {
  if (pence < 0)   return { level: 'negative',      label: 'Plunge' };
  if (pence < 10)  return { level: 'cheap',         label: 'Cheap' };
  if (pence < 25)  return { level: 'normal',        label: 'Normal' };
  if (pence < 35)  return { level: 'expensive',     label: 'Pricey' };
  return           { level: 'very-expensive',       label: 'Costly' };
}

function renderElectricityPrice(data) {
  const body = document.getElementById('electricity-body');
  const badge = document.getElementById('electricity-badge');

  if (data.status === 'error') {
    badge.textContent = 'Agile';
    badge.className = 'widget-badge';
    setBodyText(body, 'widget-error', data.message ?? 'Unknown error');
    return;
  }

  const { rate, validTo, nextRate, nextValidTo, standingCharge } = data;
  const { level, label } = getPriceLevel(rate);

  badge.textContent = label;
  badge.className = `widget-badge electricity-badge-${level}`;

  const priceEl = document.createElement('div');
  priceEl.className = `electricity-price electricity-price-${level}`;
  priceEl.textContent = `${rate.toFixed(2)}p`;

  const unitEl = document.createElement('div');
  unitEl.className = 'electricity-unit';
  unitEl.textContent = standingCharge != null
    ? `per kWh · ${standingCharge.toFixed(2)}p/day standing charge`
    : 'per kWh inc. VAT';

  const untilEl = document.createElement('div');
  untilEl.className = 'electricity-until';
  if (validTo) {
    const until = new Date(validTo);
    untilEl.textContent = `Until ${until.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  const nextEl = document.createElement('div');
  nextEl.className = 'electricity-next';
  if (nextRate != null) {
    const { level: nextLevel } = getPriceLevel(nextRate);
    const nextSpan = document.createElement('span');
    nextSpan.className = `electricity-price-${nextLevel}`;
    nextSpan.textContent = `${nextRate.toFixed(2)}p`;
    nextEl.append('Next ', nextSpan);
    if (nextValidTo) {
      const until = new Date(nextValidTo);
      nextEl.append(` until ${until.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
    }
  }

  body.replaceChildren(priceEl, unitEl, untilEl, nextEl);
}

async function loadElectricityPrice() {
  try {
    const res = await fetch('/api/electricity-price');
    renderElectricityPrice(await res.json());
  } catch {
    setBodyText(document.getElementById('electricity-body'), 'widget-error', 'Could not reach electricity price API.');
  }
}

function renderGasPrice(data) {
  const body = document.getElementById('gas-body');
  const badge = document.getElementById('gas-badge');

  badge.textContent = 'Variable';
  badge.className = 'widget-badge';

  if (data.status === 'unconfigured') {
    setBodyText(body, 'widget-error', 'OCTOPUS_GAS_PRODUCT_CODE not set.');
    return;
  }

  if (data.status === 'error') {
    setBodyText(body, 'widget-error', data.message ?? 'Unknown error');
    return;
  }

  const priceEl = document.createElement('div');
  priceEl.className = 'gas-price';
  priceEl.textContent = `${data.rate.toFixed(2)}p`;

  const unitEl = document.createElement('div');
  unitEl.className = 'gas-unit';
  unitEl.textContent = data.standingCharge != null
    ? `per kWh · ${data.standingCharge.toFixed(2)}p/day standing charge`
    : 'per kWh inc. VAT';

  body.replaceChildren(priceEl, unitEl);
}

async function loadGasPrice() {
  try {
    const res = await fetch('/api/gas-price');
    renderGasPrice(await res.json());
  } catch {
    setBodyText(document.getElementById('gas-body'), 'widget-error', 'Could not reach gas price API.');
  }
}

loadGasPrice();
setInterval(loadGasPrice, 60 * 60 * 1000);

function renderElectricityGraph(data) {
  const container = document.getElementById('electricity-graph');

  if (data.status === 'error' || !data.rates?.length) {
    container.replaceChildren();
    return;
  }

  const rates = data.rates;
  const NS = 'http://www.w3.org/2000/svg';
  const SLOTS = 48, W = 480, BAR_H = 52;
  const slotW = W / SLOTS;

  const maxRate = rates.reduce((m, r) => Math.max(m, r.rate), 0);
  const scale = Math.max(20, maxRate);

  const firstSlot = new Date(rates[0].validFrom);
  const now = new Date();
  const nowFrac = Math.min(1, Math.max(0, (now - firstSlot) / (30 * 60 * 1000)));
  const nowX = nowFrac * slotW;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${BAR_H}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const tooltip = document.createElement('div');
  tooltip.className = 'electricity-graph-tooltip';
  tooltip.hidden = true;

  rates.forEach((slot, i) => {
    const h = Math.max(1, (Math.max(0, slot.rate) / scale) * BAR_H);
    const { level } = getPriceLevel(slot.rate);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', i * slotW);
    rect.setAttribute('y', BAR_H - h);
    rect.setAttribute('width', slotW - 1);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', PRICE_LEVEL_COLORS[level]);

    rect.addEventListener('mouseenter', () => {
      const br = rect.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      const from = new Date(slot.validFrom).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const to   = new Date(slot.validTo  ).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      tooltip.textContent = `${slot.rate.toFixed(2)}p · ${from}–${to}`;
      tooltip.hidden = false;
      const barCenterX = br.left - cr.left + br.width / 2;
      const half = tooltip.offsetWidth / 2;
      tooltip.style.left = `${Math.max(half, Math.min(barCenterX, cr.width - half))}px`;
    });
    rect.addEventListener('mouseleave', () => { tooltip.hidden = true; });

    svg.appendChild(rect);
  });

  const nowLine = document.createElementNS(NS, 'line');
  nowLine.setAttribute('x1', nowX);
  nowLine.setAttribute('y1', 0);
  nowLine.setAttribute('x2', nowX);
  nowLine.setAttribute('y2', BAR_H);
  nowLine.setAttribute('stroke', 'rgba(255,255,255,0.65)');
  nowLine.setAttribute('stroke-width', '1.5');
  svg.appendChild(nowLine);

  const labelsDiv = document.createElement('div');
  labelsDiv.className = 'electricity-graph-labels';
  for (let i = 0; i <= SLOTS; i += 12) {
    const span = document.createElement('span');
    span.textContent = new Date(firstSlot.getTime() + i * 30 * 60 * 1000)
      .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    labelsDiv.appendChild(span);
  }

  container.replaceChildren(svg, labelsDiv, tooltip);
}

async function loadElectricityGraph() {
  try {
    const res = await fetch('/api/electricity-rates');
    renderElectricityGraph(await res.json());
  } catch {
    document.getElementById('electricity-graph').replaceChildren();
  }
}

function scheduleNextElectricityRefresh() {
  const now = new Date();
  const msIntoSlot = (now.getMinutes() % 30) * 60 * 1000 + now.getSeconds() * 1000 + now.getMilliseconds();
  const msUntilNextSlot = 30 * 60 * 1000 - msIntoSlot;
  setTimeout(() => {
    loadElectricityPrice();
    loadElectricityGraph();
    scheduleNextElectricityRefresh();
  }, msUntilNextSlot);
}

loadElectricityPrice();
loadElectricityGraph();
scheduleNextElectricityRefresh();

function fmtKw(watts) {
  return `${(Math.abs(watts) / 1000).toFixed(2)} kW`;
}

function makeEnergyRow(label, valueText, valueClass) {
  const labelEl = document.createElement('span');
  labelEl.className = 'myenergi-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = `myenergi-value${valueClass ? ' ' + valueClass : ''}`;
  valueEl.textContent = valueText;

  const row = document.createElement('div');
  row.className = 'myenergi-row';
  row.append(labelEl, valueEl);
  return row;
}

function renderMyenergi(data) {
  const body  = document.getElementById('myenergi-body');
  const badge = document.getElementById('myenergi-badge');

  if (data.status === 'unconfigured') {
    badge.textContent = '';
    badge.className = 'widget-badge';
    setBodyText(body, 'widget-error', 'MYENERGI_SERIAL / MYENERGI_API_KEY not set.');
    return;
  }

  if (data.status === 'error') {
    badge.textContent = 'Error';
    badge.className = 'widget-badge';
    setBodyText(body, 'widget-error', data.message ?? 'Unknown error');
    return;
  }

  const { solarW, gridW, chargeW, sessionKwh, status, mode, plugged } = data;

  badge.textContent = mode;
  const charging = status === 'Diverting' || status === 'Boosting';
  badge.className = `widget-badge${charging ? ' myenergi-badge-charging' : ''}`;

  const rows = [];

  rows.push(makeEnergyRow('Solar generation', fmtKw(solarW), 'myenergi-solar'));

  const houseW = Math.max(0, solarW + gridW - chargeW);
  rows.push(makeEnergyRow('House consumption', fmtKw(houseW), ''));

  if (gridW > 0) {
    rows.push(makeEnergyRow('Grid import', fmtKw(gridW), 'myenergi-import'));
  } else if (gridW < 0) {
    rows.push(makeEnergyRow('Grid export', fmtKw(gridW), 'myenergi-export'));
  } else {
    rows.push(makeEnergyRow('Grid', '0.00 kW', ''));
  }

  const chargeLabel = !plugged             ? 'Car charging (unplugged)' :
                      status === 'Complete' ? 'Car charging (complete)'  :
                      status === 'Paused'   ? 'Car charging (paused)'    :
                      status === 'Fault'    ? 'Car charging (fault)'     : 'Car charging';
  rows.push(makeEnergyRow(chargeLabel, fmtKw(chargeW), charging ? 'myenergi-charging' : ''));

  if (plugged && sessionKwh > 0) {
    rows.push(makeEnergyRow('Session', `${sessionKwh.toFixed(2)} kWh`, 'myenergi-session'));
  }

  body.replaceChildren(...rows);
}

async function loadMyenergi() {
  try {
    const res = await fetch('/api/myenergi');
    renderMyenergi(await res.json());
  } catch {
    setBodyText(document.getElementById('myenergi-body'), 'widget-error', 'Could not reach myenergi API.');
  }
}

loadMyenergi();
setInterval(loadMyenergi, 30_000);

function fmtSpeed(kbps) {
  if (!kbps) return '0 kbps';
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${Math.round(kbps)} kbps`;
}

function makeDecoSpeedEl(dlKbps, ulKbps) {
  const dl = document.createElement('span');
  dl.className = 'deco-dl';
  dl.textContent = `↓ ${fmtSpeed(dlKbps)}`;
  const ul = document.createElement('span');
  ul.className = 'deco-ul';
  ul.textContent = `↑ ${fmtSpeed(ulKbps)}`;
  const wrap = document.createElement('span');
  wrap.className = 'deco-speeds';
  wrap.append(dl, ul);
  return wrap;
}

function renderDeco(data) {
  const body  = document.getElementById('deco-body');
  const badge = document.getElementById('deco-badge');

  if (data.status === 'unconfigured') {
    badge.textContent = '';
    badge.className = 'widget-badge';
    setBodyText(body, 'widget-error', 'DECO_IP / DECO_PASSWORD not set.');
    return;
  }

  if (data.status === 'error') {
    badge.textContent = 'Error';
    badge.className = 'widget-badge';
    setBodyText(body, 'widget-error', data.message ?? 'Unknown error');
    return;
  }

  const { connectedDevices, downloadKbps, uploadKbps, topUsers = [] } = data;

  badge.textContent = `${connectedDevices} device${connectedDevices !== 1 ? 's' : ''}`;
  badge.className = 'widget-badge';

  const totalsRow = document.createElement('div');
  totalsRow.className = 'deco-totals';
  totalsRow.append(makeDecoSpeedEl(downloadKbps, uploadKbps));

  const slots = [...topUsers.slice(0, 5)];
  while (slots.length < 5) slots.push(null);

  const deviceRows = slots.map(u => {
    const row = document.createElement('div');
    row.className = 'myenergi-row';
    if (u) {
      const nameEl = document.createElement('span');
      nameEl.className = 'myenergi-label deco-device-name';
      nameEl.textContent = u.name;
      row.append(nameEl, makeDecoSpeedEl(u.downloadKbps, u.uploadKbps));
    } else {
      row.style.visibility = 'hidden';
      const nameEl = document.createElement('span');
      nameEl.className = 'myenergi-label';
      nameEl.textContent = '—';
      row.append(nameEl, makeDecoSpeedEl(0, 0));
    }
    return row;
  });

  body.replaceChildren(totalsRow, ...deviceRows);
}

async function loadDeco() {
  try {
    const res = await fetch('/api/deco');
    renderDeco(await res.json());
  } catch {
    setBodyText(document.getElementById('deco-body'), 'widget-error', 'Could not reach Deco API.');
  }
}

loadDeco();
setInterval(loadDeco, 10_000);

let cctvFocusedChannel = null;

function renderCctvBody() {
  const body  = document.getElementById('cctv-body');
  const badge = document.getElementById('cctv-badge');

  if (cctvFocusedChannel !== null) {
    badge.textContent = '← Grid';
    badge.className = 'widget-badge cctv-badge-back';
    badge.onclick = () => { cctvFocusedChannel = null; renderCctvBody(); };

    const cam = document.createElement('div');
    cam.className = 'cctv-camera';
    cam.id = `cctv-cam-${cctvFocusedChannel}`;

    const img = document.createElement('img');
    img.className = 'cctv-img';
    img.alt = `Camera ${cctvFocusedChannel}`;
    img.src = `/api/cctv/snapshot/${cctvFocusedChannel}?t=${Date.now()}`;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    img.onload  = () => { img.style.visibility = ''; };

    const label = document.createElement('div');
    label.className = 'cctv-label';
    label.textContent = `Camera ${cctvFocusedChannel}`;

    cam.append(img, label);
    body.replaceChildren(cam);
  } else {
    badge.textContent = 'Live';
    badge.className = 'widget-badge active';
    badge.onclick = null;

    const grid = document.createElement('div');
    grid.className = 'cctv-grid';

    for (let ch = 1; ch <= 4; ch++) {
      const cam = document.createElement('div');
      cam.className = 'cctv-camera';
      cam.id = `cctv-cam-${ch}`;
      cam.style.cursor = 'pointer';
      cam.onclick = () => { cctvFocusedChannel = ch; renderCctvBody(); };

      const img = document.createElement('img');
      img.className = 'cctv-img';
      img.alt = `Camera ${ch}`;
      img.src = `/api/cctv/snapshot/${ch}?t=${Date.now()}`;
      img.onerror = () => { img.style.visibility = 'hidden'; };
      img.onload  = () => { img.style.visibility = ''; };

      const label = document.createElement('div');
      label.className = 'cctv-label';
      label.textContent = `Camera ${ch}`;

      cam.append(img, label);
      grid.appendChild(cam);
    }

    body.replaceChildren(grid);
  }
}

function renderCctv(data) {
  const body  = document.getElementById('cctv-body');
  const badge = document.getElementById('cctv-badge');

  if (data.status === 'unconfigured') {
    badge.textContent = '';
    badge.className = 'widget-badge';
    badge.onclick = null;
    setBodyText(body, 'widget-error', 'CCTV_IP / CCTV_PASSWORD not set.');
    return;
  }

  renderCctvBody();
}

async function loadCctv() {
  try {
    const res = await fetch('/api/cctv');
    renderCctv(await res.json());
  } catch {
    document.getElementById('cctv-body').replaceChildren();
  }
}

function refreshCctvSnapshots() {
  for (let ch = 1; ch <= 4; ch++) {
    const img = document.querySelector(`#cctv-cam-${ch} .cctv-img`);
    if (!img) continue;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    img.onload  = () => { img.style.visibility = ''; };
    img.src = `/api/cctv/snapshot/${ch}?t=${Date.now()}`;
  }
}

loadCctv();
setInterval(refreshCctvSnapshots, 15_000);
