# Handoff — Leaderboard Podium Avatar Fix

## Goal

Fix the gold (1st place) podium card on the Leaderboard page:
1. Avatar was completely invisible — only the colored circle showed, no letter or photo.
2. Gold card appeared on the left instead of centered/elevated above silver and bronze.
3. When a `photo_url` exists, both the letter AND the image were visible simultaneously — only the image should show; the letter is a fallback only.

---

## Current State

All three issues are fixed and pushed. Latest commit: **`542bf56`**
Branch: `main` — clean, up to date with `origin/main`.

Visually expected behavior after fix:
- Desktop: gold card centered, elevated 8px above silver/bronze, shows photo if available (letter hidden behind it), letter visible if photo fails/missing.
- Mobile (≤640px): gold card spans full width as a horizontal row at the top, no elevation offset.

---

## Files in Flight

| File | Status |
|---|---|
| `src/components/Leaderboard.tsx` | Modified in a prior commit (`edcd525` / `9aec5a8`). Current state is stable — renders `.podium-avatar-letter` span + conditional `<img>` inside `.podium-avatar`. |
| `src/index.css` | Last modified in `542bf56`. Contains all avatar and podium layout rules. |

---

## Changes Made (Chronological)

### Commit `99f2a96`
Added `overflow: hidden` to `.podium-avatar` and `.lb-avatar`. Intended to clip the image into a circle. Did not fix the invisible-avatar bug.

### Commit `9aec5a8`
Diagnosed Safari WebKit bug: `transform: translateY(-8px)` on the gold card creates a new stacking context that breaks `overflow: hidden + border-radius` clipping on children. Replaced transform with `position: relative; top: -8px`.

Also moved `order` values from inline JSX `style` attributes into CSS classes (`.podium-card.gold { order:1 }` etc.) to prevent inline styles from overriding mobile media query overrides.

### Commit `edcd525`
Restructured `.podium-avatar` JSX to use a `.podium-avatar-letter` span as the base layer with a conditional `<img>` as a sibling. Intended to use CSS positioning to make image overlay letter.

### Commit `542bf56` (latest)
- `.podium-avatar` given `position: relative`.
- `.podium-avatar-letter` given `position: absolute; inset: 0; z-index: 1` — fills the circle, centered.
- `.podium-avatar img` given `position: absolute; inset: 0; z-index: 2` — overlays the letter when image loads successfully. `onError` handler sets `display: none`, revealing the letter as fallback.
- Mobile gold rule (`@media max-width:640px`) changed to `flex: 0 0 100%` (was `width: 100%`) to correctly claim a full flex row.
- Desktop `top: -8px` elevation moved into `@media (min-width: 641px)` block so it no longer overrides the mobile `top: 0` reset (source order issue — unscoped rule was later in the file and won the cascade).

---

## Failed Attempts

### 1. `transform: translateY` → Safari stacking context bug
Using `transform: translateY(-8px)` to elevate the gold card caused Safari/WebKit to break `overflow: hidden + border-radius` clipping inside the card. The avatar circle rendered but contents (letter/image) were invisible. Fixed by switching to `position: relative; top: -8px`.

### 2. Inline `style={{ order: ... }}` on gold card JSX
Inline styles have higher specificity than class rules, so the mobile media query override (`order: 0`) was being ignored. The gold card kept its desktop order value on mobile. Fixed by removing inline order and using CSS classes exclusively.

### 3. `width: 100%` on mobile gold card
In the mobile media query, `.podium-card.gold { width: 100% }` was set. But because `.podium { flex-wrap: wrap }` and `flex` sizing rules apply, `width` alone is sometimes overridden by flex basis. Changed to `flex: 0 0 100%` to force a full-row claim regardless of flex basis.

### 4. Unscoped `top: -8px` overriding mobile reset
The desktop gold card rule (outside any media query, line 608 in CSS) set `top: -8px`. The mobile override (`top: 0`) was declared earlier in the file (line 285, inside `@media max-width:640px`). Equal specificity → later source order wins → desktop rule always won, even on mobile. Fixed by scoping the `top: -8px` to `@media (min-width: 641px)`.

---

## Next Steps

- **Verify on real device / Safari** — the Safari stacking context fix (`position: relative` instead of `transform`) has not been confirmed on a physical iOS device. Check that the avatar circle clips correctly and the photo/letter renders inside it.
- **Avatar visibility if `photo_url` is set but image 404s** — the `onError` handler hides the `<img>` element and falls back to the letter. Confirm the Supabase storage URL for any participant with a photo actually resolves; a stale or wrong URL would look like the avatar is broken.
- **Leaderboard list avatar parity** — the list rows (`.lb-avatar`) use a simple JSX ternary (`photo_url ? <img> : <span>`) and do not need the overlay pattern. No CSS change needed there, but visually verify parity with the podium cards.
- **Mobile gold horizontal layout** — on mobile the gold card switches to `flex-direction: row`. Verify that the medal icon, avatar, name, and balance all align correctly in a single row at the intended sizes.
- **Video transition overlay feature** — there is a complete diagnosis + fix plan saved at `C:\Users\Abdulrhman\.claude\plans\snappy-scribbling-lamport.md`. The `TransitionOverlay` component and `usePageTransition` hook exist but are not wired into `App.tsx` and have no CSS. That feature is entirely dead code until integrated.
