---
"app-builder-lib": patch
---

fix: multithread the deb payload compression. fpm's deb path pipes GNU `tar -J` exporting only `XZ_OPT=-<level>`, so `data.tar` compressed single-threaded while rpm already defaults to multithreaded `xzmt` (measured on the same 6.4 GiB tree in one run: deb 1,059 s vs rpm 171 s). Export `XZ_DEFAULTS=-T0` for the deb fpm invocation (xz parses it before `XZ_OPT`, keeping the compression level unchanged; an operator-provided `XZ_DEFAULTS` wins).
