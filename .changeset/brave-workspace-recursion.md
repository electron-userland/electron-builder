---
"app-builder-lib": patch
---

fix: include workspaceRoot when checking for installed dependencies in installOrRebuild to prevent infinite npm install recursion when install-app-deps runs from a workspace member's postinstall in npm workspaces
