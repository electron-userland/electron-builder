const electron = require('electron-prebuilt'),
    proc = require('child_process'),
    child = proc.spawn(electron, ['.']);