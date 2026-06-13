import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getVersionInfo } from './version.js';
import { isConfigured, getAuthUrl, exchangeCode, getStatus } from './resideo.js';

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

app.get('/auth/resideo', (_req, res) => {
  if (!isConfigured()) return res.status(500).send('RESIDEO_CLIENT_ID and RESIDEO_CLIENT_SECRET are not set.');
  res.redirect(getAuthUrl());
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.status(400).send(`Authorization failed: ${error ?? 'no code received'}`);
  try {
    await exchangeCode(code);
    res.redirect('/');
  } catch (err) {
    res.status(500).send(`Token exchange failed: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
