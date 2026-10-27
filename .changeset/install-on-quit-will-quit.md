---
"electron-updater": minor
---

feat(updater): on Linux (deb, rpm, pacman), the install on quit runs from `will-quit`: a failed install (e.g. the authentication dialog dismissed) emits and logs `error` and the app exits without the update, unless the new `cancelQuitOnInstallFailure` option is set, which cancels the quit instead (the app keeps running with its windows closed, so reopen a window or quit from a later tick on `error`); a quit while an update install runs waits for it to finish, a quit that another `will-quit` listener cancelled does not install, and a dismissed or denied pkexec dialog stops the install instead of showing a second dialog for the `apt-get -f` or `pacman -Sy` recovery
