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
