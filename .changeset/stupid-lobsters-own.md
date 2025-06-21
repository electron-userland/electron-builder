---
"app-builder-lib": patch
---

fix: detecting workspace root for calculating whether a relative file is within the project directory due to monorepo workspaces having `process.cwd()` returning the subpackage instead of monorepo root
