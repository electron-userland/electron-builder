---
"builder-util-runtime": minor
---

feat: add the optional `blockMapSha512` field to `UpdateFileInfo`. It is covered by the manifest signature when present; a file record without it is signed without the extra fields. `decodeBlockMapV3` and `checkBlockMapV3Header` reject an empty map (no blocks, or a 0-byte file), a region that is empty or extends past the file, and blocks that do not cover the file
