const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');

Menu.setApplicationMenu(null);

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1200,
    minHeight: 860,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-close', () => win.close());

  if (isDev) {
    const port = process.env.VITE_PORT || '5000';
    win.loadURL(`http://localhost:${port}`);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
