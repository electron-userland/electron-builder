const electron = require('electron'),
    proc = require('child_process'),
    child = proc.spawn(electron, ['.']);