import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getGitInfo() {
  if (process.env.GIT_HASH && process.env.GIT_HASH !== 'unknown') {
    return { hash: process.env.GIT_HASH, date: process.env.GIT_DATE };
  }
  const hash = execSync('git rev-parse --short HEAD').toString().trim();
  const date = execSync('git log -1 --format=%cd --date=short').toString().trim();
  return { hash, date };
}

export function getVersionInfo() {
  const { version } = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
  const { hash, date } = getGitInfo();
  return { version, date, hash };
}
