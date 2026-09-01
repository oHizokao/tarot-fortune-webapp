# Witch Tarot Two-Mode Experience Design

**Date:** 2026-09-01
**Status:** Approved by user for implementation
**Scope:** Customer-facing route and interaction redesign only; preserve the existing Vercel auth, admin, AI API, deck, history, and security contracts.

## Product outcome

Tarot Daily must make the difference between the free self-reading and the authenticated AI reading obvious on the first screen. A guest can open 1, 2, or 3 cards without an account. A signed-in member can type a question first, choose a spread, reveal cards one at a time, receive a gentle AI reflection, and continue the same topic through Memory.

## Information architecture

The root page is a two-mode foyer. It keeps a compact manual reader below the foyer for backwards-compatible deep links, but the primary first-screen actions are:

- `#manual-reader`: “เปิดไพ่ด้วยตัวเอง” — no login required.
- `/ai/`: “ถามแม่มด AI” — the login page is the gate when the visitor is not signed in.

The existing `/login/`, `/admin/`, `/privacy/`, and `/terms/` routes remain unchanged as route contracts. The customer-visible navigation uses “เข้าใช้งาน” or the member name; it does not label the customer entry as “หลังบ้าน”.

## Manual mode contract

- The user chooses 1, 2, or 3 cards.
- The primary CTA opens cards from the remaining shuffled deck.
- A card cannot appear twice until the user resets the deck.
- Progress always exposes cards opened and cards remaining.
- Reset restores 78 cards and clears the current spread; history can remain available unless the user explicitly clears history.
- Guest users never see a login blocker in this flow.

## AI mode contract

The visible flow is always “01 พิมพ์คำถาม → 02 เลือกจำนวนไพ่ → 03 เปิดไพ่ → 04 รับคำตอบ”. The question is the first interactive field and remains near the top of the scene on mobile. The draw button stays disabled until a non-empty question exists. A spread is revealed once per reading; follow-up questions use the same server-side reading and same cards. “ล้างไพ่ · เริ่มเรื่องใหม่” closes the current reading, clears the answer and draft, and allows a new spread.

If a visitor is not authenticated, `/ai/` still shows the question-first preview and sends them to `/login/?next=/ai/` only when they need to receive an AI answer. The login return path is preserved. Pending, expired, no-AI, password-change, quota, timeout, offline, and upstream-error states use actionable Thai copy and never expose server internals.

## Visual direction

Use a warm cartoon witch fortune-telling scene: a central witch/reader illustration, crystal ball, moonlit indigo background, gold sparks, and the existing purple/blue brand colors. The scene is the visual anchor; forms and controls are arranged as a guided ritual rather than a dashboard.

- Desktop: question and step rail appear beside or above the central witch scene; cards and answer sit in the same visual stage.
- Mobile: question, spread choice, and primary action appear before the artwork; the artwork is a responsive focal panel and never creates an oversized blank hero.
- Cards reveal sequentially with 3D rotation, glow, and a short stagger. Answers reveal as readable speech-bubble lines.
- `prefers-reduced-motion: reduce` removes non-essential movement while keeping the state change and focus behavior.
- Existing tarot card files in `tarot-cards/` remain the source of truth; artwork is additive and does not replace the deck.

## Data and state boundaries

Keep the existing localStorage deck/history behavior for the guest manual reader. Keep authenticated AI Memory on the existing server reading APIs. The redesign must not store API keys, passwords, or AI responses in browser storage. The AI page may persist only the deck/spread presentation state already supported by its current implementation.

## Error and recovery behavior

- Empty question: focus the question field, explain the first step, and do not draw.
- Not signed in: show “เข้าใช้งานเพื่อรับคำตอบจาก AI” and preserve the return path.
- AI not enabled: keep the cards visible and explain that the account needs approval.
- AI request failure: preserve question, cards, and current reading; expose a retry button without drawing again.
- New topic: close/clear the current Memory and explicitly restore a fresh 78-card round.
- Deck exhausted: disable the draw action and show the reset action.

## Accessibility and performance

- Every step and CTA has an accessible Thai label.
- Use `aria-current="step"`, live status text, focus return to the answer heading, and visible focus styles.
- Maintain no horizontal overflow at 390px, 768px, and 1440px viewport widths.
- Lazy-load non-critical history images, preload only the first scene artwork/card, and keep generated artwork compressed for the web.

## Acceptance criteria

1. A first-time visitor can distinguish the two modes and their login requirements without reading a long paragraph.
2. A guest completes manual 1/2/3-card readings and reset without authentication.
3. An AI user follows question → count → draw → answer without scrolling to discover the next required action.
4. Follow-up and new-topic actions are visibly different and maintain the correct Memory/deck behavior.
5. The witch scene and card reveal animation work on desktop and mobile, with a reduced-motion fallback.
6. Existing authentication, admin, API, history, copy-image, no-duplicate-deck, and Vercel static routing tests remain green.

