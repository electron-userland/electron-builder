---
"electron-updater": patch
---

fix(updater): make GitHubProvider pick the highest eligible release for alpha/beta channel clients instead of the first feed entry, so a stable hotfix published after a pre-release no longer hides that newer pre-release (or offers a downgrade) (#10287)
