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
