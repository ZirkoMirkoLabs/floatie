// Regenerates the README images in docs/screenshots:  node tools/readme-shots/make.js
// 1. a hidden copy of Floatie (throwaway data, 3x pixel density) captures each state with its real transparency
// 2. compose.js lays those captures out with headlines on a plain background and saves 2x JPEGs
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');

const root = path.join(__dirname, '..', '..');
const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'floatie-raw-'));
const run = (args, env = {}) => {
  const r = spawnSync(electron, args, { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 120000 });
  process.stdout.write(r.stdout || '');
  if (r.status !== 0) { process.stderr.write(r.stderr || ''); process.exit(1); }
};

run([root, '--force-device-scale-factor=3'],
  { FLOATIE_TEST: fs.mkdtempSync(path.join(os.tmpdir(), 'floatie-demo-')), FLOATIE_TEST_SUITE: 'shots', FLOATIE_SHOTS: raw });
run([path.join(__dirname, 'compose.js'), '--force-device-scale-factor=2', raw, path.join(root, 'docs', 'screenshots')]);
console.log('README images written to docs/screenshots');
