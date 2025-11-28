---
"builder-util": patch
---

fix: only use hardlinks during unit tests to avoid breaking debian builds where /opt is on a different drive
