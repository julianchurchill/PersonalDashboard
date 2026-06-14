import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getVersionInfo } from './version.js';
import { isConfigured, getAuthUrl, exchangeCode, getStatus } from './resideo.js';
import { getCurrentRate, getUpcomingRates, getGasRate, isGasConfigured } from './octopus.js';

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
