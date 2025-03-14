const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { startSync, stopSync } = require('./dist/syncDirectory.js');

let mainWindow;

app.on('ready', () => {
mainWindow = new BrowserWindow({
    width: 850,
    height: 650,
    minWidth: 600,
    minHeight: 500,
    center: true,
    webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
    }
});
    mainWindow.loadFile('index.html');
});

ipcMain.handle('select-directory', async (event) => {
    console.log('选择目录请求收到');
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'multiSelections']
    });
    if (!result.canceled) {
        return result.filePaths;
    }
    return [];
});

ipcMain.handle('start-sync', async (event, config) => {
    try {
        await startSync(config.directories, config.trainingType, config.retryCount);
        return { success: true };
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('stop-sync', () => {
    stopSync();
    return { success: true };
});
