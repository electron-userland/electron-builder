---
"app-builder-lib": patch
---

fix(win): update the default `winCodeSign` toolset to `1.3.1`. The bundled macOS `osslsigncode` now ships its own OpenSSL, so signing Windows artifacts on macOS no longer needs Homebrew's `openssl@3` (and no longer fails with `Symbol not found: _OPENSSL_sk_set_thunks` when Homebrew's version doesn't match), and PKCS#11 signing works without installing libp11 or setting `OPENSSL_MODULES`
