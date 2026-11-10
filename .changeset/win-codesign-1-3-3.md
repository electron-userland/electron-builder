---
"app-builder-lib": patch
---

fix(win): update the default `winCodeSign` toolset to `1.3.3`. The Linux `osslsigncode` now ships its own OpenSSL 3.5 and libp11's PKCS#11 provider, so signing Windows artifacts on Linux no longer fails with "libcrypto.so.1.1: cannot open shared object file" on distros without OpenSSL 1.1 (Ubuntu 22.04 and later). `osslsigncode` is updated to 2.14 on all platforms and the .NET runtime used by Azure Trusted Signing under Wine to 8.0.33; the .NET runtime asset is now looked up per version, so explicit `1.3.0` / `1.3.1` pins keep downloading their own 8.0.28 runtime
