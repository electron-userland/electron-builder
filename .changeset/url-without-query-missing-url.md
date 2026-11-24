---
"builder-util-runtime": patch
---

fix(updater): naming a missing or non-string URL in an error message (such as a `latest*.yml` file entry without a `url`) no longer throws a `TypeError` that replaces the coded error
