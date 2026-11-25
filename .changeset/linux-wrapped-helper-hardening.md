---
"electron-updater": major
---

fix(updater)!: on Linux, run the elevation helper (`pkexec`, `gksudo`, `kdesudo`, `beesu`, else `sudo`) and the package manager only from `/usr/sbin`, `/usr/bin`, `/sbin` and `/bin`, by absolute path, never a copy elsewhere in the app's `PATH` (a helper found only elsewhere is skipped with a warning; a package manager, or `sudo` as the last helper, found in none of them fails with `ERR_UPDATER_ELEVATION_COMMAND_NOT_FOUND`); under `gksudo`, `kdesudo` or `beesu`, run the package manager in a clean environment (`env -i`, a `PATH` of those directories), so the app's environment variables, proxy settings included, do not reach it; and warn once per updater when `pkexec` is used although `gksudo` or `kdesudo` is installed in those directories too. See https://www.electron.build/docs/migration/v27-runtime-changes#linux-update-elevation
