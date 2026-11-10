---
"app-builder-lib": patch
---

fix: `${env.NAME}` macros now expand when the variable name contains a digit, such as `${env.S3_BUCKET}`. Before, the macro was left in the value as is, for example in `artifactName`, `directories.output` or a publish configuration, and an undefined variable with a digit in its name did not raise ERR_ELECTRON_BUILDER_ENV_NOT_DEFINED
