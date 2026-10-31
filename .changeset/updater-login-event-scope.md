---
"electron-updater": minor
---

feat(updater): add the overridable `Provider.onLoginChallenge(authInfo, url)`, which the updater asks before emitting `login` for an authentication challenge of an update request (`url` is that request's URL): returning anything but `true` cancels the challenge without emitting `login`. A `login` handler cancels a challenge by calling `callback()` without credentials. See https://www.electron.build/docs/features/auto-update#event-login
