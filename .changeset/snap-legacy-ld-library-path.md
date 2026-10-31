---
"app-builder-lib": patch
---

fix(snap): core18/core20/core22 snaps set LD_LIBRARY_PATH in `command.sh` and add the caller's value only when it is set, so an unset LD_LIBRARY_PATH no longer leaves an empty entry that makes the dynamic linker search the current directory
