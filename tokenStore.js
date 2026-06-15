import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');

function tokenFile(name) {
  return join(DATA_DIR, `${name}.json`);
}

export function loadTokens(name = 'tokens') {
  try {
    return JSON.parse(readFileSync(tokenFile(name), 'utf8'));
  } catch {
    return null;
  }
}

export function saveTokens(tokens, name = 'tokens') {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(tokenFile(name), JSON.stringify({ ...tokens, savedAt: Date.now() }));
}
