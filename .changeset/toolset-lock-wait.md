---
"app-builder-lib": patch
---

fix: parallel builds that take turns on electron-builder's shared cross-process locks (the toolset lock that Squirrel.Windows and MSI hold for a whole installer build, and the signtool and icons locks) wait up to about 60 minutes for the lock instead of giving up after about 8 minutes while other builds still hold it. A crashed holder's lock is still taken over after 2 minutes. When the wait does run out, the error names the lock file instead of proper-lockfile's bare "Lock file is already being held".
