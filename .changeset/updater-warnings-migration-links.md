---
"electron-updater": patch
---

fix(updater): the packaged-app `allowInsecureFeed` warning links https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https, and the `login` warnings (no listener, a listener that threw) link https://www.electron.build/docs/migration/v27-runtime-changes#update-credentials-stay-on-the-feeds-origin, instead of the auto-update feature page
