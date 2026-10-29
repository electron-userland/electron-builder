---
"app-builder-lib": patch
---

fix(linux): update the default `fpm` toolset to `2.3.1` (fpm 1.18.0, Ruby 3.4.12). Its Linux bundles link a static OpenSSL 3.5.9 instead of Debian buster's end-of-life OpenSSL 1.1.1, with the same glibc 2.28 floor. The archive name is now looked up per version, so an explicit `toolsets.fpm: "2.2.1"` pin still downloads the fpm 1.17.0 bundle, and an unknown version throws a configuration error
