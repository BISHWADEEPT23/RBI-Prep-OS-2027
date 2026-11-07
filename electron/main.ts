import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  Notification,
  session,
  shell,
} from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Path helpers ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = 'http://localhost:5173';
const RENDERER_PROD_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const TIMER_RECOVERY_PATH = path.join(app.getPath('userData'), 'timer-recovery.json');
const WINDOW_STATE_PATH = path.join(app.getPath('userData'), 'window-state.json');
const BACKUPS_DIR = path.join(app.getPath('userData'), 'backups');

// ─── Startup Performance Instrumentation ─────────────────────────────────────
const startupMetrics = {
  appLaunchEpochMs: Date.now(),
  appReadyMs: 0,
  windowCreatedMs: 0,
  readyToShowMs: 0,
  didFinishLoadMs: 0,
};

// ─── Window state persistence ─────────────────────────────────────────────────
interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_PATH, 'utf-8');
    return JSON.parse(raw) as WindowState;
  } catch {
    return { width: 1280, height: 800 };
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds();
    const state: WindowState = {
      ...bounds,
      maximized: win.isMaximized(),
    };
    fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state), 'utf-8');
  } catch {
    // Non-fatal
  }
}

// ─── CSP ──────────────────────────────────────────────────────────────────────
function applyCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob:",
            "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com wss://*.firebaseio.com",
            "worker-src 'self' blob:",
            "frame-ancestors 'none'",
          ].join('; '),
        ],
      },
    });
  });
}

// ─── Main window ─────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  const state = loadWindowState();

  const iconPath =
    process.platform === 'win32'
      ? path.join(__dirname, '..', 'assets', 'icons', 'app.ico')
      : path.join(__dirname, '..', 'assets', 'icons', 'app-512.png');

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 640,
    title: 'RBI Prep OS 2027',
    icon: fs.existsSync(iconPath) ? iconPath : path.join(__dirname, '..', 'public', 'pwa-512x512.png'),
    backgroundColor: '#f7f9f8',
    show: false, // prevent flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  // Show only after ready-to-show to avoid white flash
  mainWindow.once('ready-to-show', () => {
    startupMetrics.readyToShowMs = Date.now() - startupMetrics.appLaunchEpochMs;
    console.log(`[Startup Timing] Window ready-to-show in ${startupMetrics.readyToShowMs} ms`);
    if (!mainWindow) return;
    if (state.maximized) {
      mainWindow.maximize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    startupMetrics.didFinishLoadMs = Date.now() - startupMetrics.appLaunchEpochMs;
    console.log(`[Startup Timing] Renderer did-finish-load in ${startupMetrics.didFinishLoadMs} ms`);
  });

  if (isDev) {
    mainWindow.loadURL(RENDERER_DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(RENDERER_PROD_PATH);
  }

  // ── Persist window state on close ──
  mainWindow.on('close', () => {
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // ── Block navigation outside the app origin ──
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = isDev
      ? ['http://localhost:5173']
      : [`file://${path.dirname(RENDERER_PROD_PATH)}`];

    const parsedUrl = new URL(url);
    const isAllowed = allowedOrigins.some(
      (origin) => url.startsWith(origin) || parsedUrl.origin === origin
    );

    if (!isAllowed) {
      event.preventDefault();
      // Open external links in the system browser
      shell.openExternal(url);
    }
  });

  // ── Block new window creation (open-redirect mitigation) ──
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only allow external links via system browser for http/https
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  applyCSP();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Save file dialog
ipcMain.handle('dialog:saveFile', async (_event, filename: string, buffer: ArrayBuffer) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: filename,
    filters: [
      { name: 'ZIP Archives', extensions: ['zip'] },
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, Buffer.from(buffer));
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// Open file dialog
ipcMain.handle(
  'dialog:openFile',
  async (_event, filters: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: filters ?? [
        { name: 'ZIP Archives', extensions: ['zip'] },
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
    try {
      const buffer = fs.readFileSync(result.filePaths[0]);
      return { success: true, buffer: buffer.buffer, filePath: result.filePaths[0] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
);

// Native notification
ipcMain.handle('notification:show', (_event, title: string, body: string) => {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
});

// App info
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);

// Theme detection
ipcMain.handle('app:getNativeTheme', () =>
  nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
);

// Timer recovery — persist and read back
ipcMain.handle('timer:setRecoveryState', (_event, state: unknown) => {
  try {
    fs.writeFileSync(TIMER_RECOVERY_PATH, JSON.stringify(state), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('timer:getRecoveryState', () => {
  try {
    const raw = fs.readFileSync(TIMER_RECOVERY_PATH, 'utf-8');
    return { success: true, state: JSON.parse(raw) };
  } catch {
    return { success: false, state: null };
  }
});

ipcMain.handle('timer:clearRecoveryState', () => {
  try {
    if (fs.existsSync(TIMER_RECOVERY_PATH)) {
      fs.unlinkSync(TIMER_RECOVERY_PATH);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// ── Startup Performance Metrics IPC ──
ipcMain.handle('app:getStartupMetrics', () => {
  return {
    ...startupMetrics,
    nowEpochMs: Date.now(),
    uptimeSeconds: process.uptime(),
  };
});

// ── Automatic Local Backup IPCs (Stored in userData/backups, NOT in app install folder) ──
ipcMain.handle('backup:getAutoBackupDir', () => {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  return BACKUPS_DIR;
});

ipcMain.handle(
  'backup:saveAutoBackup',
  async (_event, filename: string, payload: string, maxBackups = 7) => {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }

      // Basic JSON sanity check to prevent corrupt backup files
      JSON.parse(payload);

      const cleanFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const targetPath = path.join(BACKUPS_DIR, cleanFilename);
      const tempPath = `${targetPath}.tmp`;

      // Atomic write: write to temp file then rename
      fs.writeFileSync(tempPath, payload, 'utf-8');
      fs.renameSync(tempPath, targetPath);

      // Rotation: keep latest maxBackups files
      const existing = fs
        .readdirSync(BACKUPS_DIR)
        .filter((f) => f.endsWith('.json') || f.endsWith('.zip'))
        .map((f) => {
          const fullPath = path.join(BACKUPS_DIR, f);
          const stat = fs.statSync(fullPath);
          return { name: f, fullPath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      let rotatedCount = 0;
      if (existing.length > maxBackups) {
        for (let i = maxBackups; i < existing.length; i++) {
          try {
            fs.unlinkSync(existing[i].fullPath);
            rotatedCount++;
          } catch {}
        }
      }

      return {
        success: true,
        filePath: targetPath,
        rotatedCount,
        totalBackups: Math.min(existing.length, maxBackups),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
);

ipcMain.handle('backup:listAutoBackups', async () => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return { success: true, backups: [] };
    }
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.json') || f.endsWith('.zip'))
      .map((f) => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          filePath: fullPath,
          sizeBytes: stat.size,
          createdAtIso: new Date(stat.mtimeMs).toISOString(),
          schemaVersion: '5.0-local-first-hybrid',
        };
      })
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

    return { success: true, backups: files };
  } catch (err) {
    return { success: false, error: String(err), backups: [] };
  }
});

ipcMain.handle('backup:readAutoBackup', async (_event, filename: string) => {
  try {
    const cleanFilename = path.basename(filename);
    const targetPath = path.join(BACKUPS_DIR, cleanFilename);
    if (!fs.existsSync(targetPath)) {
      return { success: false, error: 'Backup file does not exist.' };
    }
    const content = fs.readFileSync(targetPath, 'utf-8');
    return { success: true, content, filePath: targetPath };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});
