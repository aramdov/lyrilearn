# Phase 1 Test Suite Design

**Date:** 2026-02-22
**Runner:** `bun test` (built-in, no extra deps)

## Unit Tests — Pure Logic

### 1. LRC Parsing (`services/lrclib.test.ts`)
- `parseLrcTimestamp()` — valid timestamps, invalid input, edge cases
- `parseSyncedLyrics()` — multi-line LRC, empty lines filtered, end time computation from next line, single line (no end time), instrumental breaks
- `parsePlainLyrics()` — multi-line, empty line filtering, whitespace trimming

### 2. Response Transforms (`routes/lyrics.test.ts`)
- Song/lyrics/translation row mapping to API format
- Override precedence: `override_text` wins over `translated_text`
- Provider/modelVariant set to "override"/"manual" when override present

## Integration Tests — Mocked Dependencies

### 3. Translation Priority Chain (`services/translation/index.test.ts`)
Uses real in-memory SQLite DB, mocked providers.
- Override in DB → returns override, skips providers
- Cache hit → returns cached, no live call
- Cache miss → calls provider, caches result
- Primary unavailable → falls back to other provider
- Both unavailable → throws error
- `getProviderStatus()` with various availability combos

### 4. Service Clients (`services/genius.test.ts`, `youtube.test.ts`, `lrclib-client.test.ts`)
Mock `globalThis.fetch`.
- Response mapping from raw API shape to our types
- Graceful degradation when API keys missing
- Error handling on non-200 responses

### 5. Route Handlers (`routes/search.test.ts`, `routes/translate.test.ts`)
Use Hono's `app.request()` test helper with mocked services.
- Input validation (missing fields → 400)
- Successful flow → correct response shape
- Provider unavailable → 503

## File Structure

```
apps/server/src/
├── services/
│   ├── lrclib.test.ts          # Unit: parsing
│   ├── genius.test.ts          # Integration: fetch mock
│   ├── youtube.test.ts         # Integration: fetch mock
│   └── translation/
│       └── index.test.ts       # Integration: SQLite + mock providers
├── routes/
│   ├── lyrics.test.ts          # Unit: transforms
│   ├── translate.test.ts       # Integration: route handler
│   └── search.test.ts          # Integration: route handler
```
