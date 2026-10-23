---
"app-builder-lib": patch
---

fix(nsis): pin the LZMA2 block size of differential-aware packages so their bytes no longer depend on the build host's thread count. On hosts with fewer than 4 threads (such as 2-CPU GitHub runners), 7-Zip wrote one solid stream, so most of the package changed every release and differential updates downloaded nearly the whole package. Output on 4+ thread hosts is unchanged.
