const { app, BrowserWindow, shell } = require('electron');

const desktopUrl = process.env.MECHAFLOW_DESKTOP_URL;
const smokeMode = process.env.MECHAFLOW_DESKTOP_SMOKE === '1';

if (!desktopUrl) {
  throw new Error('MECHAFLOW_DESKTOP_URL must point to the local Vite demo URL. Use npm run desktop:dev.');
}

const desktopOrigin = new URL(desktopUrl).origin;

const isDesktopOrigin = (url) => {
  try {
    return new URL(url).origin === desktopOrigin;
  } catch {
    return false;
  }
};

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    title: 'MechaFlow CAD local desktop demo',
    backgroundColor: '#08111f',
    show: !smokeMode,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isDesktopOrigin(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isDesktopOrigin(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await window.loadURL(desktopUrl);
  if (smokeMode) app.quit();
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
