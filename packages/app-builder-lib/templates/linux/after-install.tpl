#!/bin/bash

# Link to the binary
ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'

# SUID chrome-sandbox for Electron 5+
chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

update-mime-database /usr/share/mime || true
update-desktop-database /usr/share/applications || true
