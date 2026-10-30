---
"electron-updater": patch
---

fix(updater): a channel file request (`latest*.yml`) to another origin than the update feed, such as a GitLab release link to another host or a `channel` that is a URL, is sent without the credential headers from `requestHeaders` / `addAuthHeader`, the same rule as for downloads; the first such request per updater logs a warning naming the headers and origins
