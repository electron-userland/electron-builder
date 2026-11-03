---
"electron-updater": minor
---

feat(updater): the `login` event gets the URL of the update request that got the authentication challenge as its third argument, `(authInfo, callback, url)`, so a handler answers a server's challenge only for the origin its credentials are meant for (`new URL(url).origin`) and a proxy's by `authInfo.isProxy`. A `login` handler cancels a challenge by calling `callback()` without credentials, and without a `login` listener the updater cancels it. See https://www.electron.build/docs/features/auto-update#event-login
