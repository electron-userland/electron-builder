#!/bin/bash

# Link to the binary
ln -sf '/opt/${productFilename}/${executable}' '/usr/bin/${executable}'

update-mime-database /usr/share/mime || true
update-desktop-database /usr/share/applications || true