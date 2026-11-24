---
"app-builder-lib": patch
---

fix(publish): each `latest*.yml` lists every artifact once. With several channels (`generateUpdatesFilesForAllChannels`) or publish configurations, the files of the second and later artifacts (for example the macOS `.dmg` after the `.zip`) were listed once per channel file and publish configuration
