# Premium Question Composer — Task 4 QA

Date: 2026-09-11 (Asia/Bangkok)
Branch / baseline: `codex/witch-two-modes` at `f506c78` before Task 4 changes

## Result

PASS for the Task 4 local acceptance scope. Guest card reading and the mocked member question → cards → prediction → result flow remain functional. Follow-up, waiting, retry, and opening saved history are covered. No production code was changed.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run check` | PASS, exit 0 (all configured JavaScript syntax checks) |
| `npx playwright test tests/e2e/guest.spec.mjs tests/e2e/pro-ritual-reader.spec.mjs tests/e2e/reader-scenes.spec.mjs` (integrated baseline) | PASS, 56/56 |
| `npx playwright test tests/e2e/guest.spec.mjs --grep "acceptance viewport\|multiline Thai"` | PASS, 4/4 |
| `npx playwright test tests/e2e/guest.spec.mjs:245 --project=mobile-chromium --repeat-each=2` | RED reproduced: 1 pass, 1 fail from exact `148` vs `147.99996948242188` geometry comparison |
| `npx playwright test tests/e2e/guest.spec.mjs:245 --project=mobile-chromium --repeat-each=4` (first tolerance attempt) | 1 pass, 3 fail; same subpixel variation remained in the focused-state equality |
| `npx playwright test tests/e2e/guest.spec.mjs:245 --project=mobile-chromium --repeat-each=4` (final tolerance) | GREEN, 4/4 |
| `npx playwright test tests/e2e/guest.spec.mjs tests/e2e/pro-ritual-reader.spec.mjs tests/e2e/reader-scenes.spec.mjs` (final) | PASS, 60/60 in desktop Chromium + mobile Chromium, 0 failed |
| `npm test` (once before commit) | PASS, 112/112, 0 failed/skipped/cancelled/todo |

The one updated pre-existing assertion was not stale product copy. It was a brittle exact floating-point geometry comparison; it now keeps exact color/border checks and uses a 0.001px tolerance for dimensions. No copy assertion required an update.

## Responsive and computed evidence

| Viewport | Document / viewport width | Textarea left–right / width | Font / textarea height | Predict / reset height |
| --- | --- | --- | --- | --- |
| 360 × 844 | 360 / 360 | 12–348 / 336px | 16px / 136px | 62 / 49px |
| 390 × 844 | 390 / 390 | 12–378 / 366px | 16px / 136px | 62 / 49px |
| 430 × 844 | 430 / 430 | 12–418 / 406px | 16px / 136px | 62 / 49px |
| 768 × 844 | 768 / 768 | 24–744 / 720px | 18px / 148px | 62 / 49px |
| 1440 × 900 | 1440 / 1440 | 340–1100 / 760px | 18px / 148px | 62 / 49px |

At every width, `document.documentElement.scrollWidth <= window.innerWidth`, the textarea stayed within the viewport, and the tested textarea/predict/reset controls were at least 44px high. Computed desktop composer colors were surface `rgb(23, 19, 32)`, text `rgb(245, 240, 232)`, placeholder `rgb(186, 178, 200)`, and focused border `rgb(216, 191, 140)`. Calculated contrast against the composer surface is 16.09:1 for entered text and 8.94:1 for placeholder text.

## Behavioral coverage

- Empty question remains blocked even after selecting a card; Thai one-line input enables prediction; long Thai input is preserved; clearing text disables prediction again.
- Focus is visible without changing the field's practical dimensions. `Tab` moves forward and `Shift+Tab` returns to the textarea.
- Pressing Enter in the textarea inserts a newline and keeps the compose view open. Typing, focus, Tab navigation, and Enter caused 0 draw calls and 0 answer calls.
- Existing E2E coverage passed for guest ordinary reading, member question/card/predict/result, waiting state, follow-up with memory, retry of an unanswered round, and opening old history.

## Screenshots and API boundary

Integrated post-change screenshots were generated for all five widths in both Playwright projects under ignored `test-results/guest-member-question-comp-8c55e-ewport-with-usable-controls-*/composer-*px.png`. They are local transient artifacts and are not committed. Task 4 began from the already-integrated Task 1–3 baseline, so it did not create a new pre-change capture or touch the user's untracked `output/` directory.

All member API flows above are mocks installed with Playwright routing for `/api/auth/me` and `/api/ai/deck-sessions`; the guest flow is local browser behavior. No real OpenAI/API smoke test was performed. Remaining limitation: viewport emulation does not validate physical-device Thai IME behavior or software-keyboard occlusion, and the repository E2E configuration covers Chromium rather than Safari/Firefox.

## Reviewer fix report — 2026-09-11

The four review gaps were closed without production-code changes:

1. Reproducible before/after captures now exist for all five acceptance widths. The before site was served from a temporary clean `git archive` of `f506c78ffb806198a38a0b03351bdf087b111bac` on port 4184. The after site was served from the current worktree whose parent is `bad4704`. Both revisions have the same `ai/` tree hash, `153c5151a8e25946b52d54c68f41a16702e738a4`, because Task 4 changes tests and documentation only. Therefore visual parity between these Task 4 before/after sets is expected; this is not presented as a Task 1 pre-redesign comparison.
2. Each relevant measured control (`#ai-question`, `#draw-button`, and `#reset-button`) now asserts both rendered width and height are at least 44px at 360, 390, 430, 768, and 1440px. Minimum observed size was the Reset control at 336 × 49px.
3. Keyboard coverage now asserts that Tab from `#ai-question` focuses the first generated `.tarot-deck-card`, then Shift+Tab returns to `#ai-question`. Enter still inserts a newline without navigation or draw/answer API calls.
4. Every required viewport now checks text contrast ≥4.5:1, placeholder contrast ≥4.5:1, settled focus-border contrast ≥3:1, exact gold focus color, 1px border width, and unchanged textarea width/height. Observed ratios at every width were 16.09:1 text, 8.94:1 placeholder, and 10.21:1 focus border.

### Visual evidence paths

The PNGs are deliberately ignored transient QA artifacts and were not staged. They remain available in this worktree at these exact repository-relative paths:

| Width | Before — exact `f506c78` archive | After — current branch |
| --- | --- | --- |
| 360px | `.playwright-cli/task4-visual-evidence/before-f506c78/composer-360px.png` | `.playwright-cli/task4-visual-evidence/after-current/composer-360px.png` |
| 390px | `.playwright-cli/task4-visual-evidence/before-f506c78/composer-390px.png` | `.playwright-cli/task4-visual-evidence/after-current/composer-390px.png` |
| 430px | `.playwright-cli/task4-visual-evidence/before-f506c78/composer-430px.png` | `.playwright-cli/task4-visual-evidence/after-current/composer-430px.png` |
| 768px | `.playwright-cli/task4-visual-evidence/before-f506c78/composer-768px.png` | `.playwright-cli/task4-visual-evidence/after-current/composer-768px.png` |
| 1440px | `.playwright-cli/task4-visual-evidence/before-f506c78/composer-1440px.png` | `.playwright-cli/task4-visual-evidence/after-current/composer-1440px.png` |

The 390px and 1440px pairs were also visually inspected: the focused composer remains legible and aligned, the deck begins below it without horizontal clipping, and the only capture-to-capture differences are expected ambient deck/background animation frames.

Capture commands and results:

- Before: `$env:BASE_URL='http://127.0.0.1:4184'; npx playwright test tests/e2e/guest.spec.mjs --grep "acceptance viewport" --project=desktop-chromium --output=test-results/task4-visual-before-f506c78` — PASS, 1/1.
- After: `npx playwright test tests/e2e/guest.spec.mjs --grep "acceptance viewport" --project=desktop-chromium --output=test-results/task4-visual-after-bad4704` — PASS, 1/1.

### Reviewer-fix verification

| Command | Result |
| --- | --- |
| `npx playwright test tests/e2e/guest.spec.mjs --grep "acceptance viewport\|multiline Thai"` (first review run) | 2/4 passed; the intentionally over-broad deck-card touch-target inclusion exposed its transformed 33.49px projected width and was removed from the composer/action target set |
| Same focused command (second review run) | 2/4 passed; immediate focus sampling caught the intentional 180ms transition mid-color |
| Same focused command after waiting for settled focus styling | PASS, 4/4 |
| `npx playwright test tests/e2e/guest.spec.mjs tests/e2e/pro-ritual-reader.spec.mjs tests/e2e/reader-scenes.spec.mjs` | PASS, 60/60, 0 failed |
| `npm test` | PASS, 112/112, 0 failed/skipped/cancelled/todo |
| `npm run check` | PASS, exit 0 |

Guest/member flow assertions and the earlier mock boundary remain unchanged. Member auth/deck/answer flows are mocked, no real OpenAI/API smoke test was performed, and physical-device Thai IME/software-keyboard occlusion plus non-Chromium browser behavior remain outside this local acceptance run.

## Task 5 local release preparation — 2026-09-11

- Prepared branch `codex/witch-two-modes` from reviewed release-candidate commit `7dfcd9e` in the existing linked worktree.
- Advanced both `/ai/` asset query strings together from `20260910-ai-two-scene-v42` to the previously unused `20260910-ai-two-scene-v43`; matching release assertions were updated without changing behavioral coverage.
- Local release gates passed: `npm run check` (exit 0), `npm test` (112/112), and the specified Playwright guest/member/scene smoke suite (60/60 across desktop and mobile Chromium).
- This step did not push, deploy, access external credentials, inspect a Vercel preview, or perform a production/real-API smoke test. The controller still owns those external release checks.
