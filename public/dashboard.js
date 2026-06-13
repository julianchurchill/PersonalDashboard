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
  const body = document.getElementById('heating-body');
  const modeEl = document.getElementById('heating-mode');

  if (data.status === 'unconfigured') {
    modeEl.textContent = '';
    body.innerHTML = `<span class="widget-error">RESIDEO_CLIENT_ID / RESIDEO_CLIENT_SECRET not set.</span>`;
    return;
  }

  if (data.status === 'unauthorized') {
    modeEl.textContent = '';
    body.innerHTML = `<span class="widget-auth-prompt">Click to authorise</span>`;
    const widget = document.getElementById('heating-widget');
    widget.classList.add('widget-clickable');
    widget.onclick = () => window.open('/auth/resideo', '_blank');
    return;
  }

  document.getElementById('heating-widget').classList.remove('widget-clickable');
  document.getElementById('heating-widget').onclick = null;

  if (data.status === 'error') {
    modeEl.textContent = '';
    body.innerHTML = `<span class="widget-error">${data.message}</span>`;
    return;
  }

  modeEl.textContent = data.zones?.[0]?.mode ?? '';
  modeEl.className = 'widget-badge' + (data.zones?.[0]?.mode === 'Heat' ? ' active' : '');

  const rows = [];
  for (const z of (data.zones ?? [])) {
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

  body.innerHTML = rows.join('') || '<span class="widget-loading">No devices found.</span>';
}

async function loadHeating() {
  try {
    const res = await fetch('/api/heating');
    renderHeating(await res.json());
  } catch (err) {
    document.getElementById('heating-body').innerHTML =
      `<span class="widget-error">Could not reach heating API.</span>`;
  }
}

loadHeating();
setInterval(loadHeating, 60_000);
