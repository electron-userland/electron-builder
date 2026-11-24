---
"app-builder-lib": patch
---

fix(snap): core18/core20/core22 snaps carry the library path (a configured `environment.LD_LIBRARY_PATH`, or the default one) in snap.yaml as `ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH`, and `command.sh` exports it as LD_LIBRARY_PATH with its empty entries dropped, so an unset `$SNAP_LIBRARY_PATH` or `$LD_LIBRARY_PATH` leaves no empty entry that makes the dynamic linker search the current directory
