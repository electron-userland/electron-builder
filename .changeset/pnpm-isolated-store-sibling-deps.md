---
"app-builder-lib": patch
---

fix(pnpm): bundle the transitive dependencies of a `link:`ed package. A located package is now resolved to its real directory before its own dependencies are searched for — in an isolated pnpm store those are siblings inside `.pnpm/<name>@<ver>/node_modules/`, reachable only from the link target — and a package that cannot locate itself by name (a workspace directory such as `packages/builder-util-runtime`) now has its dependencies read straight from that directory instead of contributing none. Previously an app whose `electron-updater` came from a local checkout shipped an asar missing `universalify`, `jsonfile` and `argparse`, and died at startup with `Cannot find module 'universalify'`. Dependencies that cannot be resolved are now reported in the collector log summary rather than skipped silently.
