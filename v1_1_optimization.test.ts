/**
 * v1_1_optimization.test.ts
 *
 * Automated tests for RBI Prep OS 2027 v1.1.0 Windows Desktop Optimization:
 * - Multi-resolution ICO and PNG icon verification
 * - Bundle optimization and route-level code splitting
 * - Desktop navigation sidebar and title bar integration
 * - Service worker isolation in Electron
 * - Offline readiness and keyboard shortcuts
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

// ─── Tests ──────────────────────────────────────────────────────────────────

await test('OPT-01: Multi-resolution Windows app.ico exists', () => {
  const icoPath = path.join(__dirname, 'assets', 'icons', 'app.ico');
  assert(fs.existsSync(icoPath), 'assets/icons/app.ico does not exist');
  const stat = fs.statSync(icoPath);
  assert(stat.size > 20000, `app.ico size too small (${stat.size} bytes), must contain multi-res frames`);

  // Verify ICO header: 0x0000, type 0x0001 (icon)
  const buf = fs.readFileSync(icoPath);
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  assert(reserved === 0, 'Invalid ICO reserved field');
  assert(type === 1, 'Invalid ICO type (must be 1 for icon)');
  assert(count >= 7, `ICO must contain at least 7 icon sizes (16,24,32,48,64,128,256); found ${count}`);
});

await test('OPT-02: High-resolution PNG icons exist (256x256 & 512x512)', () => {
  const p256 = path.join(__dirname, 'assets', 'icons', 'app-256.png');
  const p512 = path.join(__dirname, 'assets', 'icons', 'app-512.png');
  assert(fs.existsSync(p256), 'assets/icons/app-256.png missing');
  assert(fs.existsSync(p512), 'assets/icons/app-512.png missing');
});

await test('OPT-03: electron-builder config uses assets/icons/app.ico', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'electron-builder.config.json'), 'utf8'));
  assert(cfg.win?.icon === 'assets/icons/app.ico', `win.icon must be assets/icons/app.ico, got ${cfg.win?.icon}`);
});

await test('OPT-04: Route-level code splitting produced chunked assets in dist', () => {
  const assetsDir = path.join(__dirname, 'dist', 'assets');
  assert(fs.existsSync(assetsDir), 'dist/assets directory not found');
  const files = fs.readdirSync(assetsDir);

  const hasAnalyticsChunk = files.some((f) => f.startsWith('AnalyticsDashboard-'));
  const hasVaultChunk = files.some((f) => f.startsWith('KnowledgeVault-'));
  const hasFocusChunk = files.some((f) => f.startsWith('FocusRoom-'));
  const hasHomeChunk = files.some((f) => f.startsWith('HomeDashboard-'));

  assert(hasAnalyticsChunk, 'AnalyticsDashboard chunk was not separated into lazy bundle');
  assert(hasVaultChunk, 'KnowledgeVault chunk was not separated into lazy bundle');
  assert(hasFocusChunk, 'FocusRoom chunk was not separated into lazy bundle');
  assert(hasHomeChunk, 'HomeDashboard chunk was not separated into lazy bundle');
});

await test('OPT-05: Main entry bundle is significantly reduced from monolithic 1.64MB', () => {
  const assetsDir = path.join(__dirname, 'dist', 'assets');
  const files = fs.readdirSync(assetsDir);
  const mainBundle = files.find((f) => f.startsWith('index-') && f.endsWith('.js'));
  assert(Boolean(mainBundle), 'Main index bundle not found in dist/assets');
  const size = fs.statSync(path.join(assetsDir, mainBundle!)).size;
  assert(size < 1200000, `Main bundle should be under 1.2MB with lazy chunks; got ${size} bytes`);
});

await test('OPT-06: dist/index.html does not register service worker over file://', () => {
  const html = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8');
  assert(
    !html.includes('vite-plugin-pwa:register-sw') && !html.includes('registerSW.js'),
    'Service worker register script should not be injected into dist/index.html for Electron file://'
  );
});

await test('OPT-07: DesktopSidebar component exists with collapsible navigation', () => {
  const src = fs.readFileSync(path.join(__dirname, 'src', 'components', 'DesktopSidebar.tsx'), 'utf8');
  assert(src.includes('DesktopSidebar'), 'DesktopSidebar component export not found');
  assert(src.includes('w-[72px]'), 'Must support collapsed width of 72px');
  assert(src.includes('w-[240px]'), 'Must support expanded width of 240px');
  assert(src.includes('#427968'), 'Must use Sage Green branding');
});

await test('OPT-08: DesktopTopBar component exists with Ctrl+F and status indicators', () => {
  const src = fs.readFileSync(path.join(__dirname, 'src', 'components', 'DesktopTopBar.tsx'), 'utf8');
  assert(src.includes('DesktopTopBar'), 'DesktopTopBar component export not found');
  assert(src.includes('Ctrl+F'), 'Must support global search Ctrl+F shortcut');
  assert(src.includes('Local Device'), 'Must display local storage status');
});

await test('OPT-09: App.tsx implements global desktop keyboard shortcuts', () => {
  const src = fs.readFileSync(path.join(__dirname, 'src', 'App.tsx'), 'utf8');
  assert(src.includes("case '1':"), 'Ctrl+1 Dashboard shortcut missing');
  assert(src.includes("case '2':"), 'Ctrl+2 Routine Planner shortcut missing');
  assert(src.includes("case '3':"), 'Ctrl+3 Focus Room shortcut missing');
  assert(src.includes("case '4':"), 'Ctrl+4 Knowledge Vault shortcut missing');
  assert(src.includes("case ',':"), 'Ctrl+, Settings shortcut missing');
  assert(src.includes("case 'b':"), 'Ctrl+B Sidebar toggle shortcut missing');
});

await test('OPT-10: App.tsx wraps lazy views with Suspense and DesktopLoadingSkeleton', () => {
  const src = fs.readFileSync(path.join(__dirname, 'src', 'App.tsx'), 'utf8');
  assert(src.includes('<Suspense'), 'Suspense wrapper missing in App.tsx');
  assert(src.includes('DesktopLoadingSkeleton'), 'DesktopLoadingSkeleton fallback missing');
});

await test('OPT-11: App.tsx uses full-bleed layout (no mobile 2.5vw padding)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'src', 'App.tsx'), 'utf8');
  assert(src.includes('h-screen w-screen overflow-hidden'), 'Must use full viewport height and width');
});

await test('OPT-12: Offline startup in aiApi.ts avoids unneeded network stalls in file://', () => {
  const src = fs.readFileSync(path.join(__dirname, 'src', 'aiApi.ts'), 'utf8');
  assert(
    src.includes("window.location.protocol === 'file:'"),
    'aiApi must handle file:// protocol to avoid failing network requests during offline desktop launch'
  );
});

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  RBI Prep OS 2027 — v1.1.0 Desktop Optimization Tests');
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
