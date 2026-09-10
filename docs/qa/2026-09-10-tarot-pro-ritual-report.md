# Tarot Daily Pro Ritual Reader QA

Date: 2026-09-10 (Asia/Bangkok)

Release commit: `55e2bbd` (`feat: move reading history below reader`)

Production deployment: Vercel deployment `4CZpm7Pqp6VpKXpc22ycmehYTY21`, serving `https://tarot-daily-78-history.vercel.app/`

## Release scope

- Guest mode remains public: visitors can open cards without logging in and read the cards themselves.
- Member mode keeps one clear path: write a question, choose up to three cards from the full deck, press `ทำนาย`, then read the answer.
- The compose scene is now a calmer single reading path. The full deck is the visual focus, selected cards appear in a small tray, and selected/opened/pending/remaining counts are separated.
- The result scene keeps each draw as its own set, preserves the complete card image ratio, and places the question context beside the result instead of burying it in the answer.
- Follow-up stays on the compose scene with a blank new question, a new selection, the same continuous deck, and preserved memory/history.
- While a draw is pending, `เปิดแล้ว`, `กำลังเปิด`, and `เหลือ` remain separate; a drawn-but-unanswered history round exposes a retry action after reload.
- History remains available below the active reader as a secondary launchpad with explicit open, delete-one, delete-all, and start-new actions, so a member opens the page ready for a new reading first.
- Ambient motion stays on without a toggle, including the ritual wheel and waiting state. Reduced-motion requests slow the effects without removing the ritual signal.
- The shell is flat rather than a stack of dashboard cards, and the mobile layout stays within the viewport.

## Local verification

- `npm run check` — passed.
- `npm test` — 112 passed, 0 failed.
- `npx playwright test` — 54 passed, 2 skipped, 0 failed across desktop and mobile projects.
- Focused pro-ritual/deck/scene/member suite — 24 passed, 0 failed.
- `git diff --check` — passed.
- Visual smoke checked at desktop and mobile sizes; no horizontal overflow, clipped card source images, or hidden motion control found.
- No API key, password, cookie, or database credential was added to source, tests, logs, or this report.

## Production verification

- `GET https://tarot-daily-78-history.vercel.app/ai/` — HTTP 200.
- Production serves `ai.css?v=20260910-ai-two-scene-v42`, `ai.js?v=20260910-ai-two-scene-v42`, and `data-ui-version="pro-ritual-v1"`.
- Production HTML order was checked: active reader → reading history → footer.
- `GET /api/health` — HTTP 200; `ready`, `database`, `schema`, `admin`, and `ai` all reported true. Secret values were not recorded.
- Production guest/member smoke — 5 passed: history open/resume/delete-one/delete-all and mobile reader layout.
- Existing authenticated production session was checked after deployment: history stayed selectable, `ถามต่อ · จับไพ่ใหม่` returned to the new-question compose scene, the deck showed the committed cards as unavailable, and the remaining count stayed at 72.
- The production AI/API contract was unchanged by this UI release; the prior production AI health and authenticated answer smoke remains recorded in `docs/qa/2026-09-10-tarot-two-scene-report.md`.

## Deployment

- GitHub branch pushed: `codex/witch-two-modes`.
- Preview deployment passed before promotion: `FXJa1ScZCPMS17DZ2WpQJGtqPkX6`.
- The verified preview was promoted through Vercel to the production domain.

## Rollback

If an urgent rollback is needed, promote the previous known-good Vercel deployment for the two-scene release. The current UI change is additive and does not require a database rollback.
