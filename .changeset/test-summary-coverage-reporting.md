---
---

chore(tests): make `reset-vitest-smart-cache` actually reset shard planning; add a per-run test summary (per-test/per-shard/total durations + combined failed-tests list) to the console and `GITHUB_STEP_SUMMARY`; publish a combined `vitest --merge-reports` HTML report; add opt-in v8 coverage. CI/test-infra only — no published package changes (intentionally an empty changeset, no version bump).
