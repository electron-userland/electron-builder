---
"electron-updater": minor
---

feat(updater): on Linux (deb, rpm, pacman), a failed install on quit (e.g. the authentication dialog dismissed) emits and logs `error` and the app exits without the update, unless the new `cancelQuitOnInstallFailure` option is set: the install on quit then runs from `will-quit` and cancels the quit when it fails (the app keeps running with its windows closed, so reopen a window or quit from a later tick on `error`; register the app's own `will-quit` listeners before checking for updates, the updater only sees cancellations from listeners registered before its own). A quit while an update install runs waits for it to finish, a failed install is not retried by a later quit of the session (also for update info with only a legacy `sha2` checksum), and a dismissed or denied pkexec dialog stops the install instead of showing a second dialog for the `apt-get -f` or `pacman -Sy` recovery
