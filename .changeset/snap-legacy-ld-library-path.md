---
"app-builder-lib": patch
---

fix(snap): core18/core20/core22 snaps set LD_LIBRARY_PATH in `command.sh`, adding `$SNAP_LIBRARY_PATH` and the caller's value without empty entries (including stray colons in the caller's value); a configured `environment.LD_LIBRARY_PATH` goes into snap.yaml as `ELECTRON_BUILDER_SNAP_LD_LIBRARY_PATH` and `command.sh` exports it without empty entries, so an unset LD_LIBRARY_PATH never leaves an empty entry that makes the dynamic linker search the current directory
