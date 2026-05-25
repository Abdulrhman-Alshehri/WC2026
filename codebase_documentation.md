# FWC 2026 Prediction Pool — Codebase Documentation

Welcome to the comprehensive technical documentation for the **FIFA World Cup 2026 Prediction Pool** application. This document serves as a complete reference for the architectural design, database layout, backend logic, frontend workflows, and Telegram integration.

---

## 1. Architectural Overview

The application is structured as a premium, real-time sports prediction and virtual wallet platform. The architecture splits cleanly into a client-heavy React single-page application and a highly resilient, event-driven backend built on top of Supabase.

```
                    +------------------------------------+
                    |       React Frontend (Vite)        |
                    | (SPA, TypeScript, Glassmorphism,   |
                    |    Query Caching, Realtime Sub)    |
                    +-------------------+----------------+
                                        |
                         HTTP REST / RPC| Realtime
                         & Edge Calls   | Subscription
                                        v
                    +-------------------+----------------+
                    |          Supabase Backend          |
                    | (Postgres Database, Edge Functions,|
                    |   RLS Security, High-Integrity RPC) |
                    +-------------------+----------------+
                                        |
                                        v
                        +---------------+---------------+
                        |   Telegram Bot Webhook API   |
                        | (Real-time Pushes & Commands) |
                        +-------------------------------+
```

### Key Architectural Pillars
1. **Frontend Foundation**: Powered by **React 18.3**, **Vite**, and **TypeScript**. It utilizes `@tanstack/react-query` for state caching, query invalidation, and optimistic UI updates.
2. **Backend Services**: Hosted on **Supabase**. The Postgres database is the single source of truth, enforcing rigid domain logic through Row Level Security (RLS) policies, database triggers, and transaction-locked PL/pgSQL database functions (RPCs).
3. **Vanilla Glassmorphism Styling**: Styled using bespoke **Vanilla CSS** (`src/index.css`) that leverages custom font families (`FWC2026`, `Guesswhat`), fluid ambient gradient backdrops, backdrop filters (`saturate(160%) blur(24px)`), and fine border outlines to implement a state-of-the-art UI without external tailwind dependencies.
4. **Programmatic Video Transitions**: Employs an ultra-premium, custom-built page transition system using a hardware-accelerated video asset (`/assets/transition.mp4`) played synchronously on navigation changes.
5. **Two-Way Telegram Integration**: Connected to a Deno-based Supabase Edge Function that powers a Telegram Bot. Users can pair their bot instance to get instant goal updates, prediction lock alerts, and staking payouts.

---

## 2. Database Schema & High-Integrity Ledger

The database is built around **7 primary tables** in the `public` schema. It follows a financial domain ledger pattern to prevent double-spending and race conditions when participants stake virtual coins on matches.

### Entity Relationship Diagram
```
 +------------------+           1 : 1           +----------------+
 |   participants   |-------------------------->|    wallets     |
 +------------------+                           +----------------+
          |                                              |
          | 1                                            | 1
          |                                              |
          | N                                            | N
 +------------------+       N : 1 (match_id)    +----------------+
 |   predictions    |<--------------------------|  transactions  |
 +------------------+                           +----------------+
          |                                              |
          | N                                            | N (optional)
          |                                              |
          | 1 (match_id)                                 |
 +------------------+                                    |
 |     matches      |<-----------------------------------+
 +------------------+
          |
          | 1
          |
          | N
 +------------------------+
 | leaderboard_snapshots  |
 +------------------------+
```

### Table Definitions & Roles

1. **`participants`**: Profiles of users registered in the tournament pool. Holds fields like `name` (unique handle), `display_name`, `photo_url`, secure `pin` hash, and `telegram_user`/`telegram_chat_id` for notification routing. Enforces automated wallet creation via triggers.
2. **`wallets`**: Financial ledger holding the participant’s liquid coin balance (default `1,000,000`) and the amount actively locked in pending matches (`in_play`).
3. **`matches`**: Full fixture log detailing teams, codes (`MEX`, `USA`, `ARG`), scheduled kickoff times, scores, match state (`NS`, `LIVE`, `HT`, `FT`, `AET`, `PEN`), final result, and prediction lock-out times (`prediction_close`).
4. **`predictions`**: Record of participant stakes on match outcomes (`HOME_WIN`, `AWAY_WIN`, `DRAW`, `HOME_ADVANCE`, `AWAY_ADVANCE`). Enforces a strict database constraint of **one prediction per participant per match**.
5. **`transactions`**: Immutable audit ledger recording every wallet balance adjustment (`INITIAL_BALANCE`, `STAKE`, `UPDATE_STAKE`, `PAYOUT`, `REFUND`, `ADJUSTMENT`). Provides mathematical verification for audit compliance:
   $$\text{Wallet Balance} + \text{In Play} = \sum \text{Transaction Amounts}$$
6. **`leaderboard_snapshots`**: Captured rankings at match milestones to generate progress history and trends.
7. **`notifications_log`**: Event log tracking sync operations, match notifications, and bot alerts for debugging.

---

## 3. High-Integrity Database RPCs

To secure the platform from front-end code vulnerabilities and database concurrency issues, direct modification of balances and predictions from client-side code is blocked. Instead, **PL/pgSQL transactional functions** with explicit row-level locks are used:

### A. Prediction Placement (`place_prediction`)
- Locks the participant's `wallet` row using `SELECT ... FOR UPDATE` to block concurrent transactions.
- Confirms the current system time has not exceeded the match's `prediction_close` timestamp.
- Ensures the participant doesn't already have an existing prediction for the target match.
- Verifies the wallet has a sufficient liquid balance to cover the stake.
- Deducts the stake from `balance`, adds it to `in_play`, inserts a new prediction row, and registers a `'STAKE'` entry in the transaction log.

### B. Prediction Updates (`update_prediction`)
- Locks the active prediction and the participant's wallet row using `FOR UPDATE`.
- Validates that the prediction status is still `'PENDING'` and that the lockout time has not passed.
- Computes the delta between the old and new stakes:
  $$\Delta = \text{New Stake} - \text{Old Stake}$$
- For increases ($\Delta > 0$), checks if the available liquid balance covers the difference.
- Updates the liquid balance and `in_play` pools, modifies the prediction choice and stake, and logs an `'UPDATE_STAKE'` transaction.

### C. Prediction Cancellation (`cancel_prediction`)
- Locks the targeted prediction and participant wallet.
- Verifies that the match locking window remains open and the prediction is still `'PENDING'`.
- Refunds the entire stake amount to the liquid balance and decrements `in_play`.
- Breaks foreign-key references by disassociating the prediction ID from transactions (`ON DELETE SET NULL`) and deletes the prediction row.
- Records a `'REFUND'` transaction.

---

## 4. Frontend Architecture & Workflows

The React single-page application is built to be responsive, tactile, and visually striking.

### Key Components

- **`IdentitySelector`**: The welcome screen. Displays active participants in a horizontal swipeable carousel. When selected, it queries the participant's details. If a PIN is already configured, it presents a keypad screen; if not, it prompts the user to create a secure 4-digit PIN, updating it via Supabase before granting access. It persists logins securely via `localStorage`.
- **`TopNav`**: Displays the application branding, current page routes (Dashboard, Leaderboard, History), and a persistent balance chip that splits liquid coins and "In Play" stakes. Includes a user avatar that navigates directly to profile settings.
- **`Dashboard`**: The landing experience. Groups matches into three tabs:
  1. *Live & Highlights*: Displays in-progress matches, upcoming games, and recent results.
  2. *Group Stage*: Shows groups A through L with custom filter buttons.
  3. *Knockout Rounds*: Houses rounds from the Round of 32 up to the Grand Final.
  Contains a "Sync Live Scores" button that triggers a backend edge function to pull the latest fixtures and outcome resolutions.
- **`MatchCard`**: Renders team logos, country flag emojis, kickoff timings, live score states, and active predictions. If the prediction window is open, it presents "Edit" and "Cancel" prompts.
- **`Leaderboard`**: An extremely polished leaderboard showing a customized 3D-style podium for the top 3 participants (with active rank movement icons like `TrendingUp` or `TrendingDown`). Below the podium, all users are rendered in a sleek list.
- **`ProfileSettings`**: Allows users to customize their display name, upload custom profile photos to Supabase Storage, modify their PIN, or securely link their Telegram account.
- **`TransitionOverlay` & `usePageTransition`**: A custom hook and component system that provides cinematic transitions between routing screens. When a user changes pages, the application starts playing a fullscreen transition video (`/assets/transition.mp4`) and switches pages exactly at the midpoint of the video, creating a premium interface flow.

---

## 5. Page Transition Engine Details

The page transition system is designed to provide high-fidelity visual feedback while avoiding routing lag.

```
usePageTransition Triggered
      |
      v
1. Play Fullscreen Video Overlay (/assets/transition.mp4)
      |
      v
2. [Midpoint Transition - Exit Phase]
   - flushSync() commits the React state update to swap page components.
   - Screen renders the new page DOM behind the active video.
      |
      v
3. [End Phase - Reveal]
   - Video completes playback (or triggers a safety hard-timeout).
   - Overlay opacity fades to 0, revealing the new page.
   - Video is paused and reset to frame 0.
```

### Safety Features
- **Motion Preference Compatibility**: Automatically skips video playback if the user has enabled the `prefers-reduced-motion` media query in their OS settings.
- **Start Grace Safeguard**: A 500ms safety timer checks if the video element starts playing correctly. If blocked by browser autoplay rules, it instantly resolves the transition without freezing.
- **Hard Timeout Fallback**: Enforces a max duration limit of 2200ms, ensuring that if a video load stalls, the screen is automatically revealed.

---

## 6. Telegram Bot pairing & Real-time Webhooks

The platform features a highly automated notifications bridge powered by a Deno-based Supabase Edge Function (`supabase/functions/telegram-webhook`).

```
                [ Telegram User ]
                        |
                        | Sends /start <UUID>
                        v
          +-------------+-------------+
          |  Telegram Bot Webhook API |
          +-------------+-------------+
                        |
                        | 1. Verifies UUID in Postgres
                        | 2. Saves chat_id & telegram_user
                        | 3. Returns welcome message
                        v
          +-------------+-------------+
          |      Postgres Database    |
          +---------------------------+
```

### Bot Commands
* `/start`: Generates user pairing instructions.
* `/start <participant_uuid>`: An encrypted deep-link handler. When clicked from the frontend profile settings, it opens the bot, captures the participant's unique ID, verifies the account in Supabase, pairs their `telegram_chat_id`, and delivers a customized welcome message displaying their current wallet balance.

### Outbound Event Pushes
When critical actions occur on the website or database, the system triggers the webhook to push detailed alerts directly to the paired Telegram user:
* **`prediction_placed`**: Staking confirmation detailing coins placed and new liquid balance.
* **`prediction_updated`**: Updates showing changes in choice or stake amount.
* **`prediction_cancelled`**: Cancellation notification and refund balance updates.
* **`prediction_resolved`**: Real-time outcome resolution. Sends congratulatory victory cards with net profit details or settlement loss notices.

---

## 7. Codebase Directory Map

```
wc2026-prediction-pool/
│
├── .claude/                   # Internal planner and analysis artifacts
├── public/                    # Static assets
│   ├── logo.jpg               # Branding assets
│   └── assets/
│       └── transition.mp4     # Programmatic navigation video asset
│
├── src/
│   ├── main.tsx               # Client entry point
│   ├── App.tsx                # App routing, query declarations, and real-time triggers
│   ├── index.css              # Custom Vanilla CSS and Glassmorphism styling rules
│   │
│   ├── components/            # Reusable UI Components
│   │   ├── TopNav.tsx         # Global navigation and wallet statistics banner
│   │   ├── Dashboard.tsx      # Main hub with Live/Group/Knockout tabs and score sync
│   │   ├── MatchCard.tsx      # Individual fixture cards with prediction states
│   │   ├── PredictionModal.tsx# Slider-based staking, presets, and RPC trigger inputs
│   │   ├── Leaderboard.tsx    # 3D podium and full participant rankings list
│   │   ├── PredictionHistory.tsx # Detailed stats, wins, losses, and net profits log
│   │   ├── ProfileSettings.tsx# Username updates, avatar uploads, and Telegram pairing
│   │   ├── TransitionOverlay.tsx# Screen overlay wrapping the HTML5 transition video
│   │   ├── ConfirmModal.tsx   # Premium warning/confirmation dialogs
│   │   └── Countdown.tsx      # High-performance countdown timers for match lockouts
│   │
│   ├── hooks/
│   │   └── usePageTransition.ts # Transitions state machine, safeguards, and timers
│   │
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client instantiation
│   │   └── data.ts            # Formatting helpers, time calculators, and country flag mappings
│   │
│   └── types/
│       └── index.ts           # Shared TypeScript definitions
│
├── supabase/                  # Backend Edge Functions
│   └── functions/
│       └── telegram-webhook/  # Deno server powering the Telegram pairing bot
│
├── netlify.toml               # Client hosting redirects and publish configs
└── package.json               # Dependencies and build script configurations
```
