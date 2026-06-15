import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getVersionInfo } from './version.js';
import { isConfigured, getAuthUrl, exchangeCode, getStatus } from './resideo.js';
import { getCurrentRate, getUpcomingRates, getGasRate, isGasConfigured } from './octopus.js';
import { getCurrentWeather, isWeatherConfigured } from './weather.js';
import { getMyenergiStatus, isMyenergiConfigured } from './myenergi.js';
import { getDecoStatus, isDecoConfigured, invalidateDecoSession } from './deco.js';
import { getSnapshot, isCctvConfigured } from './cctv.js';
import { isCalendarConfigured, getCalendarAuthUrl, exchangeCalendarCode, getCalendarEvents } from './calendar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(express.static(join(__dirname, 'public')));

app.get('/api/version', (_req, res) => {
  res.json(getVersionInfo());
});

app.get('/api/heating', async (_req, res) => {
  if (!isConfigured()) return res.json({ status: 'unconfigured' });
  try {
    const data = await getStatus();
    if (!data) return res.json({ status: 'unauthorized' });
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/weather', async (_req, res) => {
  if (!isWeatherConfigured()) return res.json({ status: 'unconfigured' });
  try {
    const data = await getCurrentWeather();
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/electricity-price', async (_req, res) => {
  try {
    const data = await getCurrentRate();
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/electricity-rates', async (_req, res) => {
  try {
    const rates = await getUpcomingRates();
    res.json({ status: 'ok', rates });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/gas-price', async (_req, res) => {
  if (!isGasConfigured()) return res.json({ status: 'unconfigured' });
  try {
    const data = await getGasRate();
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/myenergi', async (_req, res) => {
  if (!isMyenergiConfigured()) return res.json({ status: 'unconfigured' });
  try {
    const data = await getMyenergiStatus();
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/cctv', (_req, res) => {
  if (!isCctvConfigured()) return res.json({ status: 'unconfigured' });
  res.json({ status: 'ok' });
});

app.get('/api/cctv/snapshot/:channel', (req, res) => {
  if (!isCctvConfigured()) return res.status(404).end();
  const channel = parseInt(req.params.channel, 10);
  const data = getSnapshot(channel);
  if (!data) return res.status(503).json({ error: 'snapshot not yet available' });
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.send(data);
});

app.get('/api/deco', async (_req, res) => {
  if (!isDecoConfigured()) return res.json({ status: 'unconfigured' });
  try {
    const data = await getDecoStatus();
    res.json({ status: 'ok', ...data });
  } catch (err) {
    invalidateDecoSession();
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/api/calendar', async (_req, res) => {
  if (!isCalendarConfigured()) return res.json({ status: 'unconfigured' });
  try {
    const data = await getCalendarEvents();
    if (!data) return res.json({ status: 'unauthorized' });
    res.json({ status: 'ok', ...data });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.get('/auth/google', (_req, res) => {
  if (!isCalendarConfigured()) return res.status(500).send('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.');
  res.redirect(getCalendarAuthUrl());
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    console.error('Google auth callback error:', error ?? 'no code received');
    return res.status(400).send('Authorisation failed. Check server logs for details.');
  }
  try {
    await exchangeCalendarCode(code);
    res.redirect('/');
  } catch (err) {
    console.error('Google token exchange failed:', err.message);
    res.status(500).send('Token exchange failed. Check server logs for details.');
  }
});

app.get('/auth/resideo', (_req, res) => {
  if (!isConfigured()) return res.status(500).send('RESIDEO_CLIENT_ID and RESIDEO_CLIENT_SECRET are not set.');
  res.redirect(getAuthUrl());
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) {
    console.error('Resideo auth callback error:', error ?? 'no code received');
    return res.status(400).send('Authorisation failed. Check server logs for details.');
  }
  try {
    await exchangeCode(code);
    res.redirect('/');
  } catch (err) {
    console.error('Resideo token exchange failed:', err.message);
    res.status(500).send('Token exchange failed. Check server logs for details.');
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
