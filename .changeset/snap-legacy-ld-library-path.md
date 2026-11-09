---
"app-builder-lib": patch
---

fix(snap): core18/core20/core22 snaps set LD_LIBRARY_PATH in `command.sh`, adding the caller's value only when it is set, and `command.sh` drops the empty entries of a configured `environment.LD_LIBRARY_PATH`, so an unset LD_LIBRARY_PATH never leaves an empty entry that makes the dynamic linker search the current directory
