'use strict'

const { app, ipcMain, BrowserWindow, Menu, Tray } = require("electron")
const fs = require("fs")
const path = require("path")

// Module to control application life.
// Module to create native browser window.

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

let tray = null

function createWindow () {
  if (process.platform === "linux" && process.env.APPDIR != null) {
    tray = new Tray(path.join(process.env.APPDIR, "testapp.png"))
    const contextMenu = Menu.buildFromTemplate([
      {label: 'Item1', type: 'radio'},
      {label: 'Item2', type: 'radio'},
      {label: 'Item3', type: 'radio', checked: true},
      {label: 'Item4', type: 'radio'}
    ])
    tray.setToolTip('This is my application.')
    tray.setContextMenu(contextMenu)
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 600});

  // and load the index.html of the app.
  mainWindow.loadURL('file://' + __dirname + '/index.html');

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.executeJavaScript(`console.log("appData: ${app.getPath("appData").replace(/\\/g, "\\\\")}")`)
  mainWindow.webContents.executeJavaScript(`console.log("userData: ${app.getPath("userData").replace(/\\/g, "\\\\")}")`)

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On MacOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow()
  }
})

ipcMain.on("saveAppData", () => {
  try {
    // electron doesn't escape / in the product name
    fs.writeFileSync(path.join(app.getPath("appData"), "Test App ßW", "testFile"), "test")
  }
  catch (e) {
    mainWindow.webContents.executeJavaScript(`console.log(\`userData: ${e}\`)`)
  }
})