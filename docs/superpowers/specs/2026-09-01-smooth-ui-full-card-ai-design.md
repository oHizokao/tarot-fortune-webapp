# Smooth UI, Full Card, and AI Recovery Design

**Date:** 2026-09-01  
**Status:** Approved by user for implementation  
**Scope:** Customer-facing layout and AI failure UX; preserve the existing deck, authentication, Memory, admin, and Vercel API contracts.

## Goal

Make Tarot Daily easy to scan from top to bottom, show every tarot card at its native full-card ratio, and make the AI path honest and recoverable when the upstream provider is unavailable.

## Current evidence

- The source card files are 448×800 WebP images.
- `ai/ai.css` uses `object-fit: cover` for `.tarot-card-card img`, so the image box crops the top or bottom of a card.
- Production login succeeds and `POST /api/ai/readings` returns 201.
- Production `POST /api/ai/tarot-chat` returns `429 AI_RATE_LIMITED`, with the message that OpenAI quota or credit is not ready. This is an upstream account/configuration issue, not a reason to fabricate an answer in the client.

## Design

### Shared page rhythm

Keep the existing routes, but align the customer-facing root, AI, login, and admin pages around one readable max-width, one primary heading, and one clear primary action per section. Decorative art may support the page, but it must not displace the main action or create oversized empty areas.

### AI reader order

The member page reads in this order on desktop and mobile:

1. Question — write the question first.
2. Spread — choose 1, 2, or 3 cards.
3. Reveal — open cards and see the complete images.
4. Answer — receive the gentle AI reflection and continue through Memory.

Guest mode keeps only the spread and reveal steps. The CSS uses one sequential reading rail instead of a tall right-hand reveal column, so the next action is never separated from the previous one by a large blank panel.

### Full-card rendering

Each card image keeps its 448:800 ratio with `object-fit: contain`; the card shell grows with the image and uses a quiet background/padding so the complete artwork and printed title remain visible. The witch scene is reduced to a supporting banner and never overlaps the card gallery.

### AI recovery

The current question, cards, and Memory remain intact on failure. The user sees an actionable status and retry button. The Admin connection test remains the place to distinguish a valid key/model from an OpenAI billing/quota failure. A production 429 remains visible as a configuration prerequisite; the app must not replace it with a fake tarot answer.

## Acceptance criteria

1. At 390px, 768px, and 1440px there is no horizontal overflow and the reading order is visually sequential.
2. All AI card images use a contain/full-card presentation and their image boxes preserve the 448:800 ratio.
3. Guest users can still open cards without a question; member users see question → spread → reveal → answer.
4. A failed AI request preserves the question and spread and exposes retry without drawing new cards.
5. Existing no-duplicate deck, reset, auth, Memory, history, admin, and Vercel route contracts remain green.
6. Production smoke explicitly reports the current upstream 429 until OpenAI billing/credit is made usable.
