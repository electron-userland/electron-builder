---
"app-builder-lib": patch
---

fix(nsis): the nsis-web installer copies, verifies and, if needed, downloads its app package before it removes the installed version, so a refused package, a `--package-file` package that cannot be copied, or a failed or cancelled download leaves the installed version in place. Because the download can take a while, a run that isn't an update (`--updated`) then checks again for the running app, with the same prompt as at the start (Cancel aborts with exit code 2), before the old uninstaller would close it without asking
