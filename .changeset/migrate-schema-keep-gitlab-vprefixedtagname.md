---
"electron-builder": patch
---

fix(migrate-schema): stop stripping `vPrefixedTagName` from GitLab publish entries. The field is still supported on `GitlabOptions` (type, scheme, and runtime — `gitlabPublisher` honors it) and has no `tagNamePrefix` equivalent, so deleting it silently flipped GitLab release tags from `1.2.3` to `v1.2.3`. The migrator now leaves GitLab entries untouched and only converts GitHub `vPrefixedTagName` → `tagNamePrefix`.
