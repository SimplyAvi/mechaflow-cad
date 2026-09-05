const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage, shell } = require('electron');

const appName = process.env.MECHAFLOW_DESKTOP_APP_NAME || 'MechaFlow CAD';
const desktopUrl = process.env.MECHAFLOW_DESKTOP_URL;
const smokeMode = process.env.MECHAFLOW_DESKTOP_SMOKE === '1';
const iconPath = path.resolve(__dirname, '..', 'resources', 'mechaflow-icon.svg');
const appIcon = fs.existsSync(iconPath)
  ? nativeImage.createFromBuffer(
      nativeImage.createFromDataURL(`data:image/svg+xml;base64,${fs.readFileSync(iconPath).toString('base64')}`).toPNG(),
    )
  : nativeImage.createEmpty();

if (!desktopUrl) {
  throw new Error('MECHAFLOW_DESKTOP_URL must point to the local Vite demo URL. Use npm start or npm run desktop:dev.');
}

const desktopOrigin = new URL(desktopUrl).origin;

app.setName(appName);
app.setAppUserModelId('com.mechaflow.cad.local-demo');

if (process.platform === 'darwin' && !appIcon.isEmpty()) {
  app.dock.setIcon(appIcon);
}

app.setAboutPanelOptions({
  applicationName: appName,
  applicationVersion: app.getVersion(),
  copyright: 'MIT licensed open-source MVP demo',
  website: 'https://github.com/SimplyAvi/mechaflow-cad',
});

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
    title: appName,
    backgroundColor: '#08111f',
    show: !smokeMode,
    autoHideMenuBar: true,
    ...(appIcon.isEmpty() ? {} : { icon: appIcon }),
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
  if (smokeMode) {
    console.log(`${appName} Electron shell loaded ${desktopUrl}`);
    app.quit();
  }
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
