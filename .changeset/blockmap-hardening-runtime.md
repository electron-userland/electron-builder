---
"builder-util-runtime": minor
---

feat: add the optional `blockMapSha512` field to `UpdateFileInfo`, covered by the manifest signature when present (manifests without it canonicalize as before), and `blockMapSizeLimit` for the largest block map accepted for a file. `decodeBlockMapV3` rejects empty maps, zero-length or out-of-file regions, blocks that do not cover the file and headers that declare tables past a size limit; `downloadToBuffer` takes an optional size limit
