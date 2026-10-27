---
"electron-updater": patch
---

fix(updater): on Linux (deb, rpm, pacman), a failed install on quit (e.g. the authentication dialog dismissed) emits `error` and then cancels the quit instead of quitting without the update: the app keeps running with its windows closed, so listen for `error` to reopen a window or to quit from a later tick, and its next quit exits without installing that update again (a different update downloaded later is installed on quit). A quit that another `will-quit` listener cancelled does not install, a quit while an update install runs waits for it to finish, and a dismissed or denied pkexec dialog stops the install instead of showing a second dialog for the `apt-get -f` or `pacman -Sy` recovery
