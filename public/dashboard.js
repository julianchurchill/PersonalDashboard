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

function renderHeating(data) {
  const modeEl = document.getElementById('heating-mode');
  modeEl.textContent = data.systemMode ?? 'Unknown';
  modeEl.className = 'widget-badge' + (data.systemMode === 'Auto' ? ' active' : '');

  const body = document.getElementById('heating-body');
  const rows = [];

  if (data.hotWater) {
    const hw = data.hotWater;
    const isOn = hw.state === 'On';
    const temp = hw.temperature != null ? `${hw.temperature}°C` : '—';
    rows.push(`<div class="widget-section-label">Hot Water</div>`);
    rows.push(`
      <div class="heating-row">
        <span class="heating-name">Domestic Hot Water</span>
        <span class="heating-temps"><span class="current">${temp}</span></span>
        <span class="dhw-state ${isOn ? 'on' : 'off'}">${hw.state ?? '—'}</span>
      </div>`);
  }

  if (data.zones.length) {
    rows.push(`<div class="widget-section-label">Zones</div>`);
    for (const z of data.zones) {
      const current = z.temperature != null ? `${z.temperature}°C` : '—';
      const target = z.target != null ? `${z.target}°C` : '—';
      const heating = z.temperature != null && z.target != null && z.temperature < z.target;
      rows.push(`
        <div class="heating-row">
          <span class="heating-indicator ${heating ? 'on' : ''}"></span>
          <span class="heating-name">${z.name}</span>
          <span class="heating-temps">
            <span class="current">${current}</span>
            <span class="arrow">→</span>${target}
          </span>
        </div>`);
    }
  }

  body.innerHTML = rows.join('');
}

async function loadHeating() {
  try {
    const res = await fetch('/api/heating');
    if (!res.ok) throw new Error(`${res.status}`);
    renderHeating(await res.json());
  } catch (err) {
    document.getElementById('heating-body').innerHTML =
      `<span class="widget-error">Could not load heating data: ${err.message}</span>`;
  }
}

loadHeating();
setInterval(loadHeating, 60_000);
