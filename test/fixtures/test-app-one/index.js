"use strict"

const { app, ipcMain, BrowserWindow, Menu, Tray } = require("electron")
const fs = require("fs")
const path = require("path")

function handleSquirrelEvent() {
  if (process.argv.length === 1) {
    return false;
  }

  const ChildProcess = require('child_process');

  const appFolder = path.resolve(process.execPath, '..');
  const rootAtomFolder = path.resolve(appFolder, '..');
  const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
  const exeName = path.basename(process.execPath);

  const spawn = function(command, args) {
    let spawnedProcess, error;

    try {
      spawnedProcess = ChildProcess.spawn(command, args, {detached: true});
    } catch (error) {}

    return spawnedProcess;
  };

  const spawnUpdate = function(args) {
    return spawn(updateDotExe, args);
  };

  const squirrelEvent = process.argv[1];
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Optionally do things such as:
      // - Add your .exe to the PATH
      // - Write to the registry for things like file associations and
      //   explorer context menus

      // Install desktop and start menu shortcuts
      spawnUpdate(['--createShortcut', exeName]);

      setTimeout(app.quit, 1000);
      return true;

    case '--squirrel-uninstall':
      // Undo anything you did in the --squirrel-install and
      // --squirrel-updated handlers

      // Remove desktop and start menu shortcuts
      spawnUpdate(['--removeShortcut', exeName]);

      setTimeout(app.quit, 1000);
      return true;

    case '--squirrel-obsolete':
      // This is called on the outgoing version of your app before
      // we update to the new version - it's the opposite of
      // --squirrel-updated

      app.quit();
      return true;
  }
}

let mainWindow
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
  mainWindow = new BrowserWindow({width: 800, height: 600, webPreferences: {nodeIntegration: true}});

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

function main() {
  if (handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
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
}

main()