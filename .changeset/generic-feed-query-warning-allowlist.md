---
"app-builder-lib": patch
---

fix(builder): the build warning for a `generic` publish `url` with a query string says that electron-updater adds the feed query only to requests on the feed's origin, and sends a request or redirect to another origin only the request headers the app's `autoUpdater.crossOriginHeaders` keeps; its suggested fixes include sending a credential as a request header that `autoUpdater.crossOriginHeaders` keeps for the origin that needs it. It names the query parameters, never their values, and links https://www.electron.build/docs/features/auto-update#custom-options-instantiating-updater-directly
