---
"electron-updater": patch
---

fix(updater): parse the boundary of a `multipart/byteranges` Content-Type in linear time and accept only a boundary of 1 to 70 characters (RFC 2046), so a long malformed header in a multi-range response is rejected at once during a differential download and quoted only in part in the error
