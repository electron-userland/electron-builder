const electron = require('electron');
const {BrowserWindow, ipcMain, app} = electron;
let path = require('path');
let win;

function createWindow() {

    win = new BrowserWindow({
        width: 1200,
        height: 700,
        backgroundColor: 0x51514c,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            webSecurity: false
        }
    });

    win.loadURL(`file://${__dirname}/index.html`);

    //avoid the initial white-flash by waiting until the page is loaded before displaying.
    win.webContents.on('did-finish-load', function() {
       win.show();
    });

    // Open the DevTools
    // win.webContents.openDevTools();

    win.on('closed', () => {
        win = null;
    });

}

ipcMain.on('notify', (event, arg) =>{
   var notifier = require('node-notifier');
   notifier.notify({
       title: arg.title,
       message: arg.message,
       sound: true,
       wait: false
   });
});

app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (win === null) {
        createWindow();
    }
});
