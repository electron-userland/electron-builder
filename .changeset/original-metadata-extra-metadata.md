---
"app-builder-lib": patch
---

fix: keep `extraMetadata` out of `Packager.originalMetadata`, so node-module collection checks the collected tree against the dependencies `package.json` declares, instead of rejecting the correct tree over an `extraMetadata.dependencies` entry that is not installed (and falling back to another tree, such as the workspace root's)
