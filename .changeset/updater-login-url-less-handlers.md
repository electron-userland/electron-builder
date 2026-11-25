---
"electron-updater": major
---

fix(updater)!: when no `login` listener takes the `url` argument, a server's authentication challenge from another origin than the update feed is cancelled without emitting `login`, with a warning once per updater; a proxy's challenge, a server's on the feed's origin (`Provider.feedBaseUrl` of the last update check or of the update being downloaded, or `previousBlockmapBaseUrlOverride`) and every challenge for a listener that takes `(authInfo, callback, url)` reach `login`. See https://www.electron.build/docs/migration/v27-runtime-changes#login-handlers-without-url
