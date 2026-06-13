import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getVersionInfo } from './version.js';
import { getHeatingStatus } from './evohome.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

app.use(express.static(join(__dirname, 'public')));

app.get('/api/version', (_req, res) => {
  res.json(getVersionInfo());
});

app.get('/api/heating', async (_req, res) => {
  try {
    res.json(await getHeatingStatus());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
