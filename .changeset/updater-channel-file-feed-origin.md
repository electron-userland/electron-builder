---
"electron-updater": patch
---

fix(updater): a channel file request (`latest*.yml`) to another origin than the update feed, such as a GitLab release link to another host or a `channel` that is a URL, sends only the request headers (from `requestHeaders` / `addAuthHeader`) that the update provider's `crossOriginHeaders` and then the app's `checkForUpdates({ crossOriginHeaders })` choose, the same rule as for downloads, so credential headers such as `Authorization` stay on the feed's origin unless the app's choice, which gets the provider's as its `defaults`, keeps them; so does a custom provider's own `httpRequest` to another origin than its `feedBaseUrl`, or to any URL when it has no feed URL (headers passed in its `headers` argument are sent as given)
