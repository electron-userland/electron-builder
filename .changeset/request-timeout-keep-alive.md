---
"builder-util-runtime": patch
"electron-updater": patch
---

fix(runtime): on Node, a request's socket timeout no longer outlives the request on a kept-alive socket, so the agent's idle timeout no longer calls back a finished download a second time with "Request timed out" or adds up `timeout` listeners on a reused socket, and a download that fails with a status of 400 or more drains the response so its socket is released
