#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distEntry = path.resolve(__dirname, '../dist/index.js');
const srcEntry = path.resolve(__dirname, '../src/index.ts');

if (fs.existsSync(distEntry)) {
  await import(distEntry);
} else if (fs.existsSync(srcEntry)) {
  await import(srcEntry);
} else {
  console.error('❌ Error: Entrypoint not found. Please run "npm run build" first.');
  process.exit(1);
}
