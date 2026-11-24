---
"builder-util": patch
---

fix(builder-util): keep secret arguments out of `ExecError.cause`, so logging or inspecting a failed `exec` error does not print them
