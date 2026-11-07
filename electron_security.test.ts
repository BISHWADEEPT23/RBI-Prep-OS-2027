/**
 * electron_security.test.ts
 *
 * Electron security smoke-tests (Node environment, no Electron binary needed).
 * Tests verify the preload bridge surface, main-process IPC handler names, and
 * the absence of insecure patterns in source files.
 *
 * Run with:  npx tsx electron_security.test.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;
const results: { label: string; ok: boolean; detail?: string }[] = [];

function test(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push({ label, ok: true });
      passed++;
    })
    .catch((err: Error) => {
      results.push({ label, ok: false, detail: err.message });
      failed++;
    });
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), 'utf-8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

await test('ES-01: electron/main.ts exists', () => {
  assert(fs.existsSync(path.join(__dirname, 'electron/main.ts')), 'electron/main.ts not found');
});

await test('ES-02: electron/preload.ts exists', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'electron/preload.ts')),
    'electron/preload.ts not found'
  );
});

await test('ES-03: contextIsolation enabled in main.ts', () => {
  const src = readSrc('electron/main.ts');
  assert(src.includes('contextIsolation: true'), 'contextIsolation must be true');
});

await test('ES-04: nodeIntegration disabled in main.ts', () => {
  const src = readSrc('electron/main.ts');
  assert(src.includes('nodeIntegration: false'), 'nodeIntegration must be false');
});

await test('ES-05: sandbox enabled in main.ts', () => {
  const src = readSrc('electron/main.ts');
  assert(src.includes('sandbox: true'), 'sandbox must be true');
});

await test('ES-06: webSecurity enabled in main.ts', () => {
  const src = readSrc('electron/main.ts');
  assert(src.includes('webSecurity: true'), 'webSecurity must be true');
});

await test('ES-07: will-navigate handler blocks external navigation', () => {
  const src = readSrc('electron/main.ts');
  assert(
    src.includes('will-navigate'),
    'will-navigate handler must be registered'
  );
  assert(
    src.includes('event.preventDefault()'),
    'must call event.preventDefault() on blocked navigation'
  );
});

await test('ES-08: setWindowOpenHandler denies popup creation', () => {
  const src = readSrc('electron/main.ts');
  assert(
    src.includes("setWindowOpenHandler"),
    'setWindowOpenHandler must be registered'
  );
  assert(
    src.includes("action: 'deny'"),
    "must deny new window creation by default"
  );
});

await test('ES-09: CSP header applied via webRequest', () => {
  const src = readSrc('electron/main.ts');
  assert(
    src.includes('onHeadersReceived'),
    'CSP must be applied via onHeadersReceived'
  );
  assert(
    src.includes('Content-Security-Policy'),
    'CSP header must be named correctly'
  );
});

await test('ES-10: Preload uses contextBridge.exposeInMainWorld', () => {
  const src = readSrc('electron/preload.ts');
  assert(
    src.includes('contextBridge.exposeInMainWorld'),
    'preload must use contextBridge'
  );
  assert(
    src.includes("'electronAPI'"),
    "exposed key must be 'electronAPI'"
  );
});

await test('ES-11: Preload does not expose require or __dirname', () => {
  const src = readSrc('electron/preload.ts');
  // These patterns in the exposed object would be a security issue
  const exposeBlock = src.slice(src.indexOf('exposeInMainWorld'));
  assert(
    !exposeBlock.includes('require('),
    'exposed API must not expose require()'
  );
});

await test('ES-12: Preload only uses ipcRenderer.invoke (no ipcRenderer.send with untrusted data)', () => {
  const src = readSrc('electron/preload.ts');
  const usesInvoke = src.includes('ipcRenderer.invoke');
  assert(usesInvoke, 'preload should use ipcRenderer.invoke for request-reply IPC');
});

await test('ES-13: IPC handlers in main.ts are all ipcMain.handle (not on)', () => {
  const src = readSrc('electron/main.ts');
  // Count ipcMain.handle vs ipcMain.on
  const handleCount = (src.match(/ipcMain\.handle\(/g) ?? []).length;
  const onCount = (src.match(/ipcMain\.on\(/g) ?? []).length;
  assert(handleCount > 0, 'must register ipcMain.handle handlers');
  assert(
    onCount === 0,
    `ipcMain.on should not be used (use handle for request-reply); found ${onCount} usage(s)`
  );
});

await test('ES-14: electron-api.d.ts type declaration exists', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'src/electron-api.d.ts')),
    'src/electron-api.d.ts type declaration not found'
  );
});

await test('ES-15: useElectronAPI hook exists', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'src/hooks/useElectronAPI.ts')),
    'src/hooks/useElectronAPI.ts not found'
  );
});

await test('ES-16: useElectronAPI isElectron() checks window.electronAPI', () => {
  const src = readSrc('src/hooks/useElectronAPI.ts');
  assert(
    src.includes('window.electronAPI'),
    'isElectron() must check window.electronAPI'
  );
});

await test('ES-17: electron-builder.config.json exists and has correct appId', () => {
  const cfgPath = path.join(__dirname, 'electron-builder.config.json');
  assert(fs.existsSync(cfgPath), 'electron-builder.config.json not found');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert(cfg.appId === 'com.rbiprepos2027.app', 'appId must be com.rbiprepos2027.app');
});

await test('ES-18: electron-builder.config.json targets NSIS and portable for Windows', () => {
  const cfg = JSON.parse(readSrc('electron-builder.config.json'));
  const targets: string[] = (cfg.win?.target ?? []).map(
    (t: { target: string } | string) => (typeof t === 'string' ? t : t.target)
  );
  assert(targets.includes('nsis'), 'must include nsis target');
  assert(targets.includes('portable'), 'must include portable target');
});

await test('ES-19: package.json main points to dist-electron/main.js', () => {
  const pkg = JSON.parse(readSrc('package.json'));
  assert(
    pkg.main === 'dist-electron/main.js',
    `package.json "main" must be "dist-electron/main.js", got "${pkg.main}"`
  );
});

await test('ES-20: package.json has electron:build script', () => {
  const pkg = JSON.parse(readSrc('package.json'));
  assert(
    typeof pkg.scripts?.['electron:build'] === 'string',
    'package.json must have electron:build script'
  );
});

await test('ES-21: TimerRecoveryBanner component exists', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'src/components/TimerRecoveryBanner.tsx')),
    'src/components/TimerRecoveryBanner.tsx not found'
  );
});

await test('ES-22: main.ts does not hardcode any API keys', () => {
  const src = readSrc('electron/main.ts');
  // Check for typical secret patterns
  const hasHardcodedKey =
    /AIza[0-9A-Za-z\-_]{35}/.test(src) || // Google API key pattern
    /["'][A-Za-z0-9+/]{40,}["']/.test(src); // base64 secrets
  assert(!hasHardcodedKey, 'main.ts must not contain hardcoded API keys');
});

await test('ES-23: GitHub Pages vite config exists', () => {
  assert(
    fs.existsSync(path.join(__dirname, 'vite.github-pages.config.ts')),
    'vite.github-pages.config.ts not found'
  );
});

await test('ES-24: GitHub Pages config has base path set', () => {
  const src = readSrc('vite.github-pages.config.ts');
  assert(
    src.includes('GH_PAGES_BASE'),
    'GitHub Pages config must define a base path constant'
  );
  assert(
    src.includes("base: GH_PAGES_BASE"),
    "GitHub Pages config must set base: GH_PAGES_BASE"
  );
});

// ─── Report ───────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  RBI Prep OS 2027 — Electron Security Tests');
console.log('═══════════════════════════════════════════════════════════\n');

for (const r of results) {
  const icon = r.ok ? '✅' : '❌';
  console.log(`${icon} ${r.label}`);
  if (!r.ok && r.detail) {
    console.log(`     → ${r.detail}`);
  }
}

console.log(
  `\n───────────────────────────────────────────────────────────\n` +
    `  ${passed} PASS  |  ${failed} FAIL  |  ${results.length} TOTAL\n` +
    `───────────────────────────────────────────────────────────\n`
);

if (failed > 0) {
  process.exit(1);
}
