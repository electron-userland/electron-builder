---
"builder-util-runtime": patch
---

fix: a download that fails with a status of 400 or above now rejects with an `HttpError` carrying `statusCode` and `code: "HTTP_ERROR_<status>"`, and its message leaves out the URL's query string and hash so signed links don't reach logs
