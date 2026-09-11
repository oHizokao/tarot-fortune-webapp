# Task 2 report: premium question composer

## Status

Implemented and committed Task 2 on `codex/witch-two-modes`. The existing partial patch was preserved and completed; no auth, AI prompt/model/API, deck state, history storage, result rendering, or motion behavior was changed.

## Prior partial attempt and RED/GREEN evidence

The worktree already contained the Task 2 patch in `ai/index.html`, `ai/ai.js`, `ai/ai.css`, and `tests/e2e/guest.spec.mjs`. I inspected it before editing and retained its correct composer copy, spacing, account-callout relocation, and follow-up focus work.

The first focused E2E run was RED: `npm run test:e2e -- tests/e2e/guest.spec.mjs` produced 37 passed / 3 failed. The meaningful failure was the must-change-password test: clicking `#account-action` stayed at `#question-title` because the old `logoutMember` listener was still attached to the new password-change link. The other two failures were the same mobile geometry assertion differing by 0.000015px between bounding-box reads.

The GREEN fix removed only the stale `#account-action` logout listener, changed the geometry assertion to a three-decimal tolerance, and updated follow-up smoke selectors to the required stable label `คำถามของคุณ`. The rerun passed 40/40 across desktop and mobile.

The first full `npm test` run passed 111/112 and exposed two stale assertions in `tests/ai-workflow.test.mjs` expecting removed legacy copy (`พิมพ์คำถามก่อน` in the initial HTML and `คำถามรอบใหม่` in the dynamic script). Those assertions were updated to the Task 2 copy. The final full unit run passed 112/112.

## Implemented changes

- Set the initial and follow-up title, description, label, placeholder, and hint copy to the approved design brief.
- Kept the account name and logout in `#account-link` only; removed duplicate composer logout behavior.
- Preserved `#account-callout`, `#account-title`, `#account-message`, and `#account-action` for the relevant no-AI-permission and must-change-password states.
- Made the password-change action navigate to login without logging the member out.
- Kept guest ordinary readings available without login.
- Reduced the member composer to one clear question surface and tightened the spread spacing so the deck begins within the desktop target.
- Kept follow-up in the same upper composer, cleared/focused by existing flow behavior, with the required memory hint.
- Updated focused assertions and the workflow contract test to protect the new copy and accessibility behavior.

## Verification

- `npm run test:e2e -- tests/e2e/guest.spec.mjs`: 40 passed.
- `npm run check`: exit 0.
- Final `npm test`: 112 passed, 0 failed.
- `git diff --check`: clean.

## Files changed

- `ai/index.html`
- `ai/ai.js`
- `ai/ai.css`
- `tests/e2e/guest.spec.mjs`
- `tests/e2e/member-ai.spec.mjs`
- `tests/ai-workflow.test.mjs`

## Self-review and concerns

The change uses the existing `pro-ritual-v1` CSS baseline and edits its existing rules rather than adding a trailing override block. The only concern is that the full suite logs an expected mocked `/api/test` 500 line during its passing API-failure test; the test run still exits 0. The pre-existing untracked `output/` directory was preserved and was not staged.
