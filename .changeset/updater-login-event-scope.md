---
"electron-updater": major
---

fix(updater)!: emit `login` only for a proxy's authentication challenge, or a server's from the update feed's origin or from an origin in `autoUpdater.loginChallengeOrigins` (default `[]`), and cancel any other. A provider whose `feedBaseUrl` is `null` has no feed origin for this check. See https://www.electron.build/docs/migration/v27-runtime-changes#login-only-gets-proxy-and-feed-origin-challenges
