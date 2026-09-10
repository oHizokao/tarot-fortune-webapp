# Tarot Daily two-scene release QA

Date: 2026-09-10 (Asia/Bangkok)

Release commit: `b6a0d90` (`feat: ship tarot two-scene reader experience`)

Production deployment: Vercel deployment `8WpQBVQFCpdX1TqzibR5SgnHV4mF`, serving `https://tarot-daily-78-history.vercel.app/`

## Scope verified

- Guest mode stays usable without login and lets a visitor select up to three cards from the complete 78-card deck.
- Member mode keeps the explicit flow: type the question, select the cards, press `ทำนาย`, then read the answer.
- Every draw continues the same deck session. Previously used cards are disabled, the exact visual slots selected by the visitor are persisted, and reset starts a new 78-card deck.
- The reader has two clear scenes: compose (question + full deck) and result (card-first reveal + answer). Browser back/forward switches scenes without drawing again.
- Result cards preserve the complete source image ratio. Answer content is presented as `ฟันธงคำถามนี้`, `อ่านไพ่ทีละใบ`, and `สรุปคำทำนาย`.
- Follow-up rounds keep memory/history, provide a new question and a new card selection, and support one-item deletion, delete-all, and reset.
- Motion is ambient and always on: rotating ritual wheel, orbit rings, sparks, and card selection motion. The layout is responsive for desktop and mobile.
- Admin has separate prompt/model settings, encrypted server-side key storage, readiness diagnostics, per-user AI access controls, quota controls, and audit entries without exposing secrets.

## Local verification

- `npm run check` — passed.
- `npm test` — 109 passed, 0 failed.
- Release E2E (`guest.spec.mjs`, `deck-selection.spec.mjs`, `deck-selection-member.spec.mjs`, `reader-scenes.spec.mjs`) — 38 passed on desktop and mobile projects.
- Production-targeted `guest.spec.mjs` — 28 passed on desktop and mobile projects.
- `git diff --check` and staged diff secret scan — passed. No API key, password, or database credential is stored in the release.

## Production verification

- `GET /api/health` returned HTTP 200 with `ready`, `database`, `schema`, `admin`, and `ai` all true.
- Production served `ai.css?v=20260910-ai-two-scene-v40` and `ai.js?v=20260910-ai-two-scene-v40`.
- Neon production database was migrated additively: `reading_rounds.selected_indexes` exists and `schema_migrations` contains version `3` named `reading_round_visual_slots`.
- Admin connection test completed successfully with `gpt-5.6-luna`.
- A real authenticated member draw completed on production and returned the direct verdict, per-card readings, overall summary, and saved memory/history.
- The key remains server-side and was not copied into the repository, browser output, QA report, or test logs.

## Rollback

If an urgent rollback is needed, promote the previous known-good Vercel deployment for commit `a7dd233`. The additive migration is backward-compatible and does not require deleting data.
