---
"electron-updater": patch
---

fix(updater): a channel file request (`latest*.yml`) to another origin than the update feed, such as a GitLab release link to another host or a `channel` that is a URL, sends only the request headers (from `requestHeaders` / `addAuthHeader`) that the app's `autoUpdater.crossOriginHeaders` keeps, the same rule as for downloads, so credential headers such as `Authorization` stay on the feed's origin unless it keeps them; so does a provider's own `httpRequest` to another origin than its `feedBaseUrl`, the headers of its `headers` argument included, apart from its `Accept`
