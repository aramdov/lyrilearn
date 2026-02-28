# LyriLearn — Architecture Overview

> Evolving reference for the codebase's structure, data flow, and component relationships.
> Open this file in Cursor's markdown preview (Cmd+Shift+V) to see rendered diagrams.

---

## 1. System Architecture

How the three runtimes communicate:

```mermaid
graph TB
    subgraph Browser["Browser (:5173)"]
        App["App.tsx"]
        Hook["useSongView() hook"]
        API["api.ts"]
        YT["YouTubePlayer → YT IFrame API"]

        App --> Hook
        App --> YT
        Hook --> API
    end

    subgraph Backend["Hono Backend (:3001)"]
        Index["index.ts"]
        Search["/api/search"]
        Translate["/api/translate"]
        Lyrics["/api/lyrics/:id"]
        Config["/api/config"]
        TIndex["translation/index.ts\n(orchestrator)"]
        Local["LocalProvider"]
        Cloud["CloudProvider"]
        DB[("SQLite\nlyrilearn.db")]

        Index --> Search
        Index --> Translate
        Index --> Lyrics
        Index --> Config
        Search --> DB
        Translate --> TIndex
        Config --> TIndex
        Lyrics --> DB
        TIndex --> Local
        TIndex --> Cloud
        TIndex --> DB
    end

    subgraph MLX["MLX Inference Server (:8000)"]
        FastAPI["FastAPI + mlx-lm"]
        M12["translategemma-12b\n(preloaded)"]
        M4["translategemma-4b\n(lazy-loaded)"]
        FastAPI --> M12
        FastAPI --> M4
    end

    subgraph External["External APIs"]
        LRCLIB["LRCLIB\n(synced lyrics)"]
        Genius["Genius\n(metadata)"]
        YouTube["YouTube Data API\n(video search)"]
        Google["Google Cloud\nTranslation v2"]
    end

    API -- "Vite proxy /api/*" --> Index
    Local --> FastAPI
    Cloud --> Google
    Search --> LRCLIB
    Search --> Genius
    Search --> YouTube

    style Browser fill:#1e293b,stroke:#3b82f6,color:#e2e8f0
    style Backend fill:#1e293b,stroke:#10b981,color:#e2e8f0
    style MLX fill:#1e293b,stroke:#f59e0b,color:#e2e8f0
    style External fill:#1e293b,stroke:#8b5cf6,color:#e2e8f0
```

---

## 2. Translation Priority Chain

The core logic in `apps/server/src/services/translation/index.ts`:

```mermaid
flowchart TD
    Start(["translate(text, sourceLang, targetLang, provider, lyricsId?)"])

    O{{"1. Override lookup\n(translation_overrides table)"}}
    C{{"2. Cache lookup\n(translations table)"}}
    L{{"3. Live translate\n(requested provider)"}}
    F{{"4. Fallback\n(other provider)"}}

    R1["Return override\nprovider: 'override'"]
    R2["Return cached translation"]
    R3["Cache result → Return"]
    R4["Cache result → Return"]
    E["Throw 503\nService Unavailable"]

    Start --> O
    O -- HIT --> R1
    O -- MISS --> C
    C -- HIT --> R2
    C -- MISS --> L
    L -- OK --> R3
    L -- FAIL --> F
    F -- OK --> R4
    F -- FAIL --> E

    style R1 fill:#065f46,stroke:#10b981,color:#e2e8f0
    style R2 fill:#065f46,stroke:#10b981,color:#e2e8f0
    style R3 fill:#065f46,stroke:#10b981,color:#e2e8f0
    style R4 fill:#065f46,stroke:#10b981,color:#e2e8f0
    style E fill:#7f1d1d,stroke:#ef4444,color:#e2e8f0
```

---

## 3. Database Schema

6 tables — the arrows show foreign key relationships:

```mermaid
erDiagram
    songs {
        INTEGER id PK
        TEXT title
        TEXT artist
        TEXT source_lang
        TEXT youtube_id
        INTEGER genius_id
        INTEGER lrclib_id
        TEXT artwork_url
        TEXT created_at
    }

    lyrics {
        INTEGER id PK
        INTEGER song_id FK
        INTEGER line_number
        TEXT text
        REAL start_time "nullable — karaoke sync"
        REAL end_time "nullable"
    }

    translations {
        INTEGER id PK
        INTEGER lyrics_id FK
        TEXT target_lang
        TEXT provider "local | cloud"
        TEXT translated_text
        TEXT transliteration "nullable"
        TEXT model_variant
        INTEGER latency_ms
        TEXT created_at
    }

    translation_overrides {
        INTEGER id PK
        INTEGER lyrics_id FK
        TEXT target_lang
        TEXT translated_text "always wins"
        TEXT notes
        TEXT created_at
    }

    search_cache {
        INTEGER id PK
        TEXT query
        TEXT source_lang
        TEXT result_json "full API response"
        TEXT expires_at "7-day TTL"
        TEXT created_at
    }

    translation_benchmarks {
        INTEGER id PK
        TEXT experiment_name
        TEXT model_variant
        TEXT provider
        TEXT input_text
        TEXT output_text
        REAL tokens_per_sec
        INTEGER latency_ms
        REAL bleu_score
        REAL memory_usage_mb
        TEXT quantization
        TEXT created_at
    }

    songs ||--o{ lyrics : "has lines"
    lyrics ||--o{ translations : "translated to"
    lyrics ||--o| translation_overrides : "manual correction"
```

### Unique Constraints

| Table | Unique Key | Purpose |
|---|---|---|
| `songs` | `(title, artist, source_lang)` | Dedup songs across searches |
| `lyrics` | `(song_id, line_number)` | One text per line position |
| `translations` | `(lyrics_id, target_lang, provider, model_variant)` | Cache key — one translation per line/lang/engine |
| `translation_overrides` | `(lyrics_id, target_lang)` | One override per line/lang (provider-agnostic) |
| `search_cache` | `(query, source_lang)` | One cached result per search |

---

## 4. Frontend Component Tree

```mermaid
graph TD
    App["App.tsx\nstate: searchResults, config, settings\nhook: useSongView(settings)"]

    Header["Header"]
    SB["SearchBar\nonSearch(query)"]
    Landing["[Landing]\n'Search for a song...'"]
    SearchView["[SearchView]"]
    SRC["SearchResultCard\nonSelect(song, lyrics, videoId)"]
    SongView["[SongView]"]
    YTP["YouTubePlayer\n{ videoId }"]
    LT["LyricsToolbar\nsource/target lang, provider,\nview mode toggles"]
    LD["LyricsDisplay\n{ lyrics, translations, viewMode }"]
    SBS["SideBySideView\nCSS grid, 2 columns"]
    ILV["InterleavedView\nstacked pairs"]

    App --> Header
    Header --> SB
    App -- "no results, no song" --> Landing
    App -- "results, no song selected" --> SearchView
    SearchView --> SRC
    App -- "song loaded" --> SongView
    SongView --> YTP
    SongView --> LT
    SongView --> LD
    LD -- "viewMode = side-by-side" --> SBS
    LD -- "viewMode = interleaved" --> ILV
    LD -- "viewMode = karaoke" --> KV["KaraokeView\nactive line + auto-scroll"]

    style App fill:#1e293b,stroke:#3b82f6,color:#e2e8f0
    style SongView fill:#1e293b,stroke:#10b981,color:#e2e8f0
    style SearchView fill:#1e293b,stroke:#f59e0b,color:#e2e8f0
    style Landing fill:#1e293b,stroke:#6b7280,color:#e2e8f0
```

---

## 5. Search Flow (POST /api/search)

The most complex backend route — orchestrates 3 external APIs:

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend
    participant Cache as SQLite Cache
    participant LRC as LRCLIB
    participant G as Genius
    participant YT as YouTube

    FE->>BE: POST /api/search { query, sourceLang }
    BE->>Cache: Check search_cache

    alt Cache HIT (< 7 days)
        Cache-->>BE: cached result_json
        BE-->>FE: { data: cached }
    else Cache MISS
        par Parallel API calls
            BE->>LRC: GET /api/search?q=...
            LRC-->>BE: track matches
            BE->>G: GET /search?q=...
            G-->>BE: metadata + artwork
            BE->>YT: GET /search?q=... official audio
            YT-->>BE: videoId + thumbnail
        end
        BE->>LRC: GET /api/get (synced lyrics)
        LRC-->>BE: .lrc with timestamps
        BE->>BE: Parse lyrics (synced preferred, plain fallback)
        BE->>Cache: INSERT song + lyrics + search_cache
        BE-->>FE: { data: { song, lyrics, videoId } }
    end
```

---

## 6. Data Flow: useSongView Hook

The frontend brain — manages song state, translation cache, and concurrent translation:

```mermaid
stateDiagram-v2
    [*] --> Idle: initial state

    Idle --> Loading: selectSong(song, lyrics)
    Loading --> Translating: getLyrics() returns cached
    Translating --> Ready: all lines translated
    Ready --> Translating: provider/lang change\n(refetchTranslations)
    Ready --> Idle: clearSong()
    Translating --> Idle: clearSong()\n(generation++ cancels in-flight)

    state Translating {
        [*] --> BatchStart
        BatchStart --> WorkerPool: spawn up to 5 concurrent
        WorkerPool --> CheckGeneration: each result
        CheckGeneration --> Accumulate: generation matches
        CheckGeneration --> Discard: generation stale
        Accumulate --> [*]: all lines done
    }
```

---

## 7. Project File Map

```
lyri-learn/
├── apps/
│   ├── inference/                      Python — MLX inference server
│   │   ├── server.py                     FastAPI, model loading, /translate, /health
│   │   └── requirements.txt              mlx-lm, fastapi, uvicorn
│   │
│   ├── server/                         TypeScript — Hono backend
│   │   ├── src/
│   │   │   ├── index.ts                  App entry, middleware, route mounting
│   │   │   ├── db/
│   │   │   │   ├── schema.sql            6 tables (see §3 above)
│   │   │   │   ├── index.ts              SQLite singleton (WAL, foreign keys)
│   │   │   │   └── init.ts              `bun run db:init` script
│   │   │   ├── routes/
│   │   │   │   ├── search.ts             Song search orchestrator (166 lines)
│   │   │   │   ├── translate.ts          Single-line translation endpoint
│   │   │   │   ├── lyrics.ts             Song lyrics + translations fetch
│   │   │   │   └── config.ts             Provider health/status
│   │   │   └── services/
│   │   │       ├── translation/
│   │   │       │   ├── provider.ts       TranslationProvider interface
│   │   │       │   ├── local.ts          LocalProvider → MLX server
│   │   │       │   ├── cloud.ts          CloudProvider → Google API
│   │   │       │   └── index.ts          Orchestrator (priority chain)
│   │   │       ├── lrclib.ts             LRCLIB client + .lrc parser
│   │   │       ├── genius.ts             Genius API client
│   │   │       └── youtube.ts            YouTube Data API client
│   │   ├── tests/                      ~43 test cases
│   │   └── data/
│   │       └── lyrilearn.db              SQLite file (gitignored)
│   │
│   └── web/                            TypeScript — React frontend
│       ├── src/
│       │   ├── main.tsx                  React 19 entry
│       │   ├── App.tsx                   Root component (169 lines)
│       │   ├── hooks/
│       │   │   ├── useSongView.ts        Song/translation state hook (151 lines)
│       │   │   └── useKaraokeSync.ts     Karaoke time-sync hook
│       │   ├── lib/
│       │   │   ├── api.ts                Backend client (100 lines)
│       │   │   ├── utils.ts              cn() utility
│       │   │   └── transliterate.ts     Client-side transliteration (any-ascii)
│       │   └── components/
│       │       ├── Header.tsx            Sticky top bar
│       │       ├── SearchBar.tsx         Search input + submit
│       │       ├── SearchResultCard.tsx  Song result display
│       │       ├── LyricsDisplay.tsx     Side-by-side / interleaved / karaoke views
│       │       ├── KaraokeView.tsx      Karaoke view with active-line highlight
│       │       ├── LyricsToolbar.tsx     Lang/provider/view toggles
│       │       ├── YouTubePlayer.tsx     YT IFrame API wrapper
│       │       └── ui/                   shadcn/ui primitives
│       │           ├── button.tsx
│       │           ├── input.tsx
│       │           ├── select.tsx
│       │           ├── toggle.tsx
│       │           └── toggle-group.tsx
│       └── tests/                      ~73 test cases
│
├── packages/
│   └── shared/
│       └── types.ts                    All cross-boundary types (116 lines)
│
├── scripts/
│   └── setup-mlx.sh                   MLX + model setup script
│
├── docs/
│   ├── ARCHITECTURE.md                 ← you are here
│   └── plans/
│
└── package.json                        Bun workspace root
```

---

## 8. Phase Roadmap

```mermaid
gantt
    title LyriLearn Build Phases
    dateFormat X
    axisFormat %s

    section Phase 1 — Backend
    Translation engine + providers     :done, p1a, 0, 1
    Search orchestration (3 APIs)      :done, p1b, 0, 1
    SQLite schema + caching            :done, p1c, 0, 1
    Backend test suite (~50 tests)     :done, p1d, 0, 1

    section Phase 2 — Frontend
    React app + shadcn/ui              :done, p2a, 1, 2
    Search → results → song view       :done, p2b, 1, 2
    YouTube player + lyrics display    :done, p2c, 1, 2
    Provider/lang/view toggles         :done, p2d, 1, 2
    Frontend test suite (~36 tests)    :done, p2e, 1, 2

    section Phase 3 — Karaoke
    YT timestamp → active line sync    :done, p3a, 2, 3
    Transliteration toggle             :done, p3b, 2, 3

    section Phase 4 — Flashcards
    IndexedDB storage (idb)            :p4a, 3, 4
    Word selection from lyrics         :p4b, 3, 4
    Spaced repetition review           :p4c, 3, 4

    section Phase 5 — Polish
    Responsive + a11y                  :p5a, 4, 5
    Error boundaries                   :p5b, 4, 5
    Production build + deploy          :p5c, 4, 5
```

---

## 9. Key Numbers

| Metric | Value |
|---|---|
| Total source files | ~49 |
| Total lines of code | ~3,460 |
| Backend test cases | ~43 |
| Frontend test cases | ~73 |
| DB tables | 6 |
| External APIs consumed | 5 (LRCLIB, Genius, YouTube, Google Translate, YT IFrame) |
| Supported languages | 12 (en, ru, ja, ko, es, fr, de, zh, ar, pt, it, hy) |

---

*Last updated: 2026-02-28 — End of Phase 3*
