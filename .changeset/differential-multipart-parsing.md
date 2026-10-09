---
"electron-updater": patch
---

fix: make multi-range differential downloads work on real servers. Three independent defects made `downloadUpdate` fall back to a full download with `Response ends without calling any handlers`:

- `DataSplitter` only recognised CRLF. Some CDNs answer `multipart/byteranges` with bare LF line endings, so no part was ever split and the whole response accumulated in memory. Header lists now end at whichever of `\r\n\r\n` / `\n\n` comes first, and the `<EOL>--boundary` separator size follows the line ending the server actually uses.
- A header-list terminator split across two chunks was never found: only the new chunk was searched, the buffered bytes never were, so the parser locked onto the next part's header instead. Only the last few bytes of an unfinished header list are now carried over and searched together with the next chunk, instead of accumulating the whole list.
- The 10s watchdog armed when a batch response ends was never disarmed after that batch succeeded. With more than 1000 operations (several range requests) it failed the whole download whenever a later batch took longer than the grace period.
