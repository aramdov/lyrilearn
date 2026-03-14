# 010 — Phase 5 Polish, Batch 1

**Date:** 2026-03-14

## What Was Done

Completed the next Phase 5 polish batch:

1. Fixed the long-standing web test isolation issues so `bun test` passes across the full `apps/web` suite, not just file-by-file.
2. Added the compare-mode info banner in the main app view.
3. Changed the MLX inference server batch route to attempt true batch generation with a safe sequential fallback for older `mlx-lm` versions.
4. Fixed the same cross-file mock leakage in the server test suite so `bun test` passes across the full `apps/server` suite.
5. Tightened workspace TypeScript configs so package-local `tsc --noEmit` checks the production code paths cleanly.
6. Updated the performance note to reflect the implemented batch path and the remaining benchmark gap.

## Modified Files

| File | Changes |
|------|---------|
| `apps/web/src/lib/api.test.ts` | Reworked the test to import a fresh `api.ts` module per test run. This prevents leaked `mock.module()` state from other test files and fixes the 12 full-suite failures. |
| `apps/web/src/hooks/useSongView.test.ts` | Added cleanup for the module mock used by the hook tests. |
| `apps/web/src/components/YouTubePlayer.test.tsx` | Stubbed script-tag append behavior so happy-dom no longer throws when the YouTube iframe API script is injected. |
| `apps/web/src/App.tsx` | Added the dismissible compare-mode banner directly below the flashcard-mode banner. |
| `apps/inference/server.py` | Replaced the sequential `/translate_batch` loop with a batched prompt path that calls `mlx_lm.generate()` once for the non-empty prompts when list prompts are supported. Added output-count validation and preserved a sequential fallback for compatibility. |
| `apps/server/src/routes/search.test.ts` | Added test mock teardown. |
| `apps/server/src/routes/translate.test.ts` | Added test mock teardown. |
| `apps/server/src/routes/lyrics.test.ts` | Added test mock teardown. |
| `apps/server/src/services/translation/index.test.ts` | Reworked the test to import a fresh `translation/index.ts` module per test run so route-test mocks do not leak into service tests. Also restored `fetch` after the suite. |
| `apps/server/src/services/youtube.test.ts` | Updated the expectation to match the current service contract: no API key returns `[]`, not `null`. The test now imports a fresh module instance. |
| `apps/web/tsconfig.app.json` | Excluded test files from the app TypeScript build. |
| `apps/server/tsconfig.json` | Switched Bun types to `bun` and excluded test files from the server TypeScript build. |
| `docs/performance-notes.md` | Marked the batch path as implemented and documented that no fresh benchmark numbers were captured in this workspace. |

## Verification

- `cd apps/web && bun test` → pass
- `cd apps/server && bun test` → pass
- `cd apps/web && npx tsc --noEmit -p tsconfig.app.json` → pass
- `cd apps/server && npx tsc --noEmit -p tsconfig.json` → pass
- `python3 -m py_compile apps/inference/server.py` → pass

## Remaining Gap

The MLX batch endpoint was not benchmarked against a live local model in this workspace. The required Python runtime dependencies are not installed here (`fastapi` and `mlx_lm` were unavailable), so the implementation was verified by syntax check and the surrounding Bun test suites only. Real timing data still needs to be captured on the actual MLX host.

## Commit Status

This chunk was logged, but not committed or pushed in this turn.
