---
"electron-updater": minor
---

feat(updater): when no `login` listener takes the `url` argument, a server's authentication challenge from another origin than the update feed (`Provider.feedBaseUrl` of the last update check or of the update being downloaded, or `previousBlockmapBaseUrlOverride`) still reaches `login`, and logs a warning once per updater that the handler cannot tell which origin it is answering. electron-updater 8, the next major version, will cancel such a challenge; take `(authInfo, callback, url)` and answer only when `new URL(url).origin` is the origin your credentials are meant for. See https://www.electron.build/docs/features/auto-update#event-login
