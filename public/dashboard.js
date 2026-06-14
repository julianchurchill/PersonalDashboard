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

  const { rate, validTo } = data;
  const { level, label } = getPriceLevel(rate);

  badge.textContent = label;
  badge.className = `widget-badge electricity-badge-${level}`;

  const priceEl = document.createElement('div');
  priceEl.className = `electricity-price electricity-price-${level}`;
  priceEl.textContent = `${rate.toFixed(2)}p`;

  const unitEl = document.createElement('div');
  unitEl.className = 'electricity-unit';
  unitEl.textContent = 'per kWh inc. VAT';

  const untilEl = document.createElement('div');
  untilEl.className = 'electricity-until';
  if (validTo) {
    const until = new Date(validTo);
    untilEl.textContent = `Until ${until.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  }

  body.replaceChildren(priceEl, unitEl, untilEl);
}

async function loadElectricityPrice() {
  try {
    const res = await fetch('/api/electricity-price');
    renderElectricityPrice(await res.json());
  } catch {
    setBodyText(document.getElementById('electricity-body'), 'widget-error', 'Could not reach electricity price API.');
  }
}

function scheduleNextElectricityRefresh() {
  const now = new Date();
  const msIntoSlot = (now.getMinutes() % 30) * 60 * 1000 + now.getSeconds() * 1000 + now.getMilliseconds();
  const msUntilNextSlot = 30 * 60 * 1000 - msIntoSlot;
  setTimeout(() => {
    loadElectricityPrice();
    scheduleNextElectricityRefresh();
  }, msUntilNextSlot);
}

loadElectricityPrice();
scheduleNextElectricityRefresh();
