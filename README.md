

<h1 align="center">⚽ WC2026 Prediction Pool — "El Casino"</h1>

<p align="center">
  <strong>A premium, real-time FIFA World Cup 2026 prediction &amp; virtual staking platform for a private group of friends.</strong>
</p>

<p align="center">
  <a href="#-features"><img src="https://img.shields.io/badge/Features-✨-blueviolet?style=for-the-badge" alt="Features" /></a>
  <a href="#-tech-stack"><img src="https://img.shields.io/badge/Stack-React%20%2B%20Supabase-0ea5e9?style=for-the-badge" alt="Tech Stack" /></a>
  <a href="#-getting-started"><img src="https://img.shields.io/badge/Get%20Started-🚀-green?style=for-the-badge" alt="Get Started" /></a>
  <a href="#-deployment"><img src="https://img.shields.io/badge/Deploy-Netlify-00c7b7?style=for-the-badge" alt="Deployment" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61dafb?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5.4-646cff?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3ecf8e?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Telegram-Bot-26a5e4?logo=telegram&logoColor=white" alt="Telegram" />
  <img src="https://img.shields.io/badge/Netlify-Hosted-00c7b7?logo=netlify&logoColor=white" alt="Netlify" />
  <img src="https://img.shields.io/badge/License-Private-red" alt="License" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [Edge Functions](#-edge-functions--backend-logic)
- [Telegram Integration](#-telegram-bot-integration)
- [Prediction & Payout Logic](#-prediction--payout-logic)
- [Frontend Components](#-frontend-components)
- [Design System](#-design-system)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Tournament Format](#-tournament-format)
- [Participants](#-participants)
- [Roadmap & Phase 2 Ideas](#-roadmap--phase-2-ideas)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌍 Overview

**WC2026 Prediction Pool** (codenamed **"El Casino"**) is a private, invite-only web application that lets a closed group of 11 participants predict match outcomes across every stage of the **FIFA World Cup 2026** — from the 48-team group play through to the Final in New Jersey.

Each participant:
- Starts with **1,000,000 virtual coins**
- Stakes coins on match outcome predictions
- Competes on a **live leaderboard** that updates automatically when results come in
- Receives real-time **Telegram notifications** for deadlines, results, and standings

The tournament runs from **June 11 – July 19, 2026**, across the United States, Canada, and Mexico — featuring **104 total matches** in the expanded 48-team format.

> **This is not a public platform.** There is no public registration. Access is controlled by the operator. The app is built to feel premium, fast, and competitive — optimized for both mobile and desktop browsers.

---

## ✨ Features

### 🎯 Core Prediction System
- **Group Stage Predictions** — Predict `HOME_WIN`, `AWAY_WIN`, or `DRAW` for group matches
- **Knockout Stage Predictions** — Predict which team *advances* (no draw option; handles extra time & penalties transparently)
- **Custom Stake Input** — Slider and numeric input from 1,000 coins up to your available balance
- **Prediction Window** — Automatically locks **1 hour before kickoff**; no late submissions accepted
- **Edit & Cancel** — Update your prediction or cancel entirely before the window closes
- **One Prediction Per Match** — Database-enforced constraint; updates are handled via upsert

### 💰 Virtual Wallet & Economy
- **1,000,000 Starting Balance** — Every participant begins with the same amount
- **Zero-Sum Proportional Redistribution** — Losers' stakes are pooled and split among winners proportionally to their stake size
- **In-Play Tracking** — Staked amounts are reserved from your available balance while the match is pending
- **Immutable Transaction Ledger** — Every balance change (stake, payout, refund, adjustment) is logged with a balance snapshot
- **Mathematical Integrity** — `balance + in_play = Σ(transactions)` is always verifiable

### 📊 Live Leaderboard
- **Real-Time Rankings** — Updates within seconds of match resolution via Supabase Realtime
- **3D Podium Design** — Gold, Silver, Bronze podium cards with elevation effects for top 3
- **Rank Change Indicators** — Animated arrows showing position movement (↑2, ↓1, etc.)
- **Historical Snapshots** — Leaderboard state is captured after every match resolution

### 📱 Premium Mobile-First UI
- **Glassmorphism Design** — Frosted glass effects with `backdrop-filter: blur(24px)` and `saturate(160%)`
- **Dark/Light Theme** — System-detected with manual override, persisted in `localStorage`
- **Custom Typography** — FWC2026-SemiExpandedBlack brand font + Guesswhat-Exceptional accent font + Inter for body text
- **Cinematic Page Transitions** — Hardware-accelerated video overlay transition system between pages
- **Responsive Layout** — Fully usable on 375px mobile viewports with 44×44px touch targets
- **Animated Countdown Clocks** — Live countdowns to next match and prediction deadlines

### 🤖 Telegram Bot Integration
- **Deep-Link Pairing** — One-tap `/start <UUID>` pairing from the profile settings page
- **Prediction Alerts** — Instant notifications for placed, updated, and cancelled predictions
- **Resolution Notifications** — Win/loss alerts with team names, flags, and coin amounts
- **Retry System** — Failed notifications retry with exponential backoff (1s → 5s → 30s)

### ⚡ Real-Time Data Sync
- **API-Football Integration** — Automated fixture ingestion from API-Sports (100 req/day free tier)
- **Live Score Polling** — 60-second server-side polling during active match windows
- **Automated Match Resolution** — Detects `FINISHED` status, applies payout formula, updates all balances
- **Supabase Realtime Subscriptions** — Client-side subscriptions for instant UI updates on matches, wallets, and predictions

### 🔒 Security
- **PIN Authentication** — Optional 4-digit PIN per participant for session protection
- **Row-Level Security (RLS)** — Enforced on all 7 database tables
- **Transactional RPCs** — All wallet mutations use `SELECT ... FOR UPDATE` row locks to prevent double-spending
- **Server-Side API Keys** — Football API and Telegram bot tokens stored as Supabase Edge Function secrets, never in client code
- **No Direct Wallet Writes** — Client code cannot modify balances; all changes go through locked PL/pgSQL functions

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend Framework** | React 18.3 | Component-based UI with hooks |
| **Language** | TypeScript 5.5 | Type safety across the entire codebase |
| **Build Tool** | Vite 5.4 | Lightning-fast HMR and optimized production builds |
| **Routing** | React Router DOM 6.26 | Client-side SPA routing |
| **State Management** | TanStack React Query 5.0 | Server state caching, query invalidation, optimistic updates |
| **Icons** | Lucide React 0.428 | Beautiful, consistent SVG icon library |
| **Styling** | Vanilla CSS | Custom glassmorphism design system with CSS custom properties |
| **Database** | Supabase (PostgreSQL) | Managed Postgres with RLS, triggers, and RPC functions |
| **Realtime** | Supabase Realtime | WebSocket subscriptions for instant UI updates |
| **Edge Functions** | Supabase Edge Functions (Deno) | Server-side API proxy, match resolution, Telegram webhook |
| **Notifications** | Telegram Bot API | Push notifications to private group |
| **Data Source** | API-Football (API-Sports) | Live match data, fixtures, scores, and standings |
| **Hosting** | Netlify | CDN-hosted SPA with redirect rules |
| **Font Hosting** | Google Fonts (Inter) | Primary body typeface |
| **Custom Fonts** | FWC2026 + Guesswhat | Self-hosted brand and accent fonts |

---

## 🏗 Architecture

The application follows a **client-heavy SPA + event-driven backend** architecture:

```
┌─────────────────────────────────────────────────────────┐
│                   REACT FRONTEND (Vite)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ React Query  │  │ Supabase     │  │ Glassmorphism │  │
│  │ Cache Layer  │  │ Realtime Sub │  │ CSS Engine    │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │
│         │                │                              │
└─────────┼────────────────┼──────────────────────────────┘
          │ HTTP REST/RPC  │ WebSocket
          ▼                ▼
┌─────────────────────────────────────────────────────────┐
│                   SUPABASE BACKEND                      │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │  PostgreSQL   │  │ Edge Functions  │  │    RLS     │  │
│  │  + Triggers   │  │ (Deno Runtime)  │  │  Policies  │  │
│  │  + RPC Locks  │  │                 │  │            │  │
│  └──────┬───────┘  └───────┬─────────┘  └────────────┘  │
│         │                  │                             │
└─────────┼──────────────────┼─────────────────────────────┘
          │                  │
          │    ┌─────────────┼──────────────┐
          │    │             │              │
          ▼    ▼             ▼              ▼
    ┌──────────────┐  ┌────────────┐  ┌──────────────┐
    │ API-Football │  │  Telegram   │  │   Supabase   │
    │ (API-Sports) │  │  Bot API   │  │   Storage    │
    └──────────────┘  └────────────┘  └──────────────┘
```

### Key Architectural Decisions

1. **Server-Side Data Proxy** — The frontend never calls the football API directly. Edge Functions act as a bridge, ensuring API key security, response caching, and rate-limit control.

2. **Financial Ledger Pattern** — The database follows a strict financial domain model. All wallet mutations are wrapped in transactional PL/pgSQL functions with `FOR UPDATE` row locks to prevent double-spending and race conditions.

3. **Supabase Realtime for Push** — Instead of polling, the frontend subscribes to Supabase Realtime channels for `wallets`, `matches`, `predictions`, and `leaderboard_snapshots` table changes.

4. **Edge-to-Edge Type Safety** — TypeScript interfaces (`src/types/index.ts`) mirror the database schema exactly, ensuring compile-time safety from database to component.

---

## 📁 Project Structure

```
wc2026-prediction-pool/
│
├── 📄 index.html                        # HTML entry point with theme detection script
├── 📄 package.json                      # Dependencies and npm scripts
├── 📄 vite.config.ts                    # Vite build configuration
├── 📄 netlify.toml                      # Netlify deployment config & SPA redirects
├── 📄 tsconfig.json                     # Root TypeScript config
├── 📄 tsconfig.app.json                 # App-specific TS compilation settings
├── 📄 tsconfig.node.json                # Node-specific TS compilation settings
│
├── 🎨 DESGIN.jpg                        # Official WC2026 brand reference sheet
├── 🔤 FWC2026-SemiExpandedBlack.ttf     # Official tournament brand font
├── 🔤 Guesswhat-Exceptional.otf         # Accent display font
├── 🖼 logo.jpg                          # Application logo asset
│
├── 🌐 public/                           # Static assets served directly
│   ├── logo.jpg                         # Branding assets
│   └── assets/
│       └── transition.mp4              # Cinematic page transition video
│
├── 📂 src/                              # Frontend application source
│   ├── main.tsx                         # React DOM entry point
│   ├── App.tsx                          # Root component: routing, queries, realtime
│   ├── index.css                        # Complete design system (68KB+ of custom CSS)
│   ├── vite-env.d.ts                    # Vite environment type declarations
│   │
│   ├── 📂 components/                   # React UI components
│   │   ├── IdentitySelector.tsx         # Welcome screen: participant selection + PIN
│   │   ├── Dashboard.tsx                # Main hub: Live/Group/Knockout match tabs
│   │   ├── MatchCard.tsx                # Individual fixture card with prediction state
│   │   ├── PredictionModal.tsx          # Staking modal: outcome selection + coin slider
│   │   ├── Leaderboard.tsx              # 3D podium + full ranking list
│   │   ├── PredictionHistory.tsx        # Past predictions with W/L stats and profits
│   │   ├── ProfileSettings.tsx          # Display name, avatar upload, PIN, Telegram
│   │   ├── TopNav.tsx                   # Navigation bar + persistent balance chip
│   │   ├── Countdown.tsx                # High-performance countdown timer
│   │   ├── ConfirmModal.tsx             # Confirmation/warning dialog
│   │   ├── TransitionOverlay.tsx        # Fullscreen video transition overlay
│   │   └── AddUserModal.tsx             # Admin: add new participant to the pool
│   │
│   ├── 📂 hooks/
│   │   └── usePageTransition.ts         # Transition state machine with safety timers
│   │
│   ├── 📂 lib/
│   │   ├── supabase.ts                  # Supabase client initialization
│   │   └── data.ts                      # Formatters, flag emojis, demo data, utilities
│   │
│   └── 📂 types/
│       └── index.ts                     # Shared TypeScript interfaces
│
├── 📂 supabase/                         # Backend: Edge Functions & Migrations
│   ├── 📂 functions/
│   │   ├── sync-fixtures/index.ts       # Fetch & upsert WC2026 fixtures from API
│   │   ├── sync-scores/index.ts         # Poll live scores & trigger match resolution
│   │   ├── telegram-webhook/index.ts    # Telegram bot: pairing + event notifications
│   │   └── retry-notifications/index.ts # Retry failed Telegram notifications
│   │
│   └── 📂 migrations/
│       ├── 20260525_add_prediction_resolved_trigger.sql
│       └── 20260526_add_resolve_match_predictions.sql
│
├── 📂 images/                           # Participant profile photos
│   ├── Abdulrhman.png
│   ├── Aseel.png
│   ├── Bijad.png
│   ├── Haddad.png
│   ├── Hussam.png
│   ├── Ibrahim.png
│   ├── Khatrawi.png
│   ├── Obaid.png
│   ├── Saleh.png
│   ├── Turkis.png
│   └── Yousef.png
│
├── 🔖 Favicon files                     # favicon.ico, apple-touch-icon.png, etc.
├── 📄 site.webmanifest                  # PWA manifest
│
├── 📄 WC2026_Prediction_PRD_v1.0.md     # Full Product Requirements Document
├── 📄 WC26_database_reference.md        # Complete database schema reference
├── 📄 codebase_documentation.md         # Technical architecture documentation
├── 📄 handoff.md                        # Developer handoff notes
├── 📄 errors_and_mistakes.md            # Development error log
│
└── 🧪 Testing scripts
    ├── test.js                          # JS: Supabase connection test
    ├── test.ts                          # TS: Supabase connection test
    ├── test_endpoints.py                # Python: REST endpoint validation
    ├── test_supabase.py                 # Python: Wallet data verification
    └── test_supabase_france.py          # Python: Match query test
```

---

## 🗄 Database Schema

The platform uses **7 tables** in the Supabase PostgreSQL `public` schema, following a **financial ledger pattern** to ensure data integrity.

### Entity Relationship Diagram

```
 ┌──────────────────┐           1 : 1           ┌────────────────┐
 │   participants   │──────────────────────────▶│    wallets     │
 └──────────────────┘                           └────────────────┘
          │                                              │
          │ 1                                            │ 1
          │                                              │
          │ N                                            │ N
 ┌──────────────────┐       N : 1 (match_id)    ┌────────────────┐
 │   predictions    │◀──────────────────────────│  transactions  │
 └──────────────────┘                           └────────────────┘
          │                                              │
          │ N                                            │ N
          │                                              │
          │ 1 (match_id)                                 │
 ┌──────────────────┐                                    │
 │     matches      │◀───────────────────────────────────┘
 └──────────────────┘
          │
          │ 1 : N
          │
 ┌────────────────────────┐
 │ leaderboard_snapshots  │
 └────────────────────────┘
```

### Table Details

#### `participants`
Profile registry of tournament users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Unique identifier |
| `name` | `text` (NOT NULL, UNIQUE) | System handle |
| `display_name` | `text` | Friendly display name |
| `photo_url` | `text` | Profile picture URL (Supabase Storage) |
| `telegram_user` | `text` | Telegram username for bot mentions |
| `pin` | `text` | Hashed 4-digit PIN for session auth |
| `is_active` | `boolean` | Account status flag |
| `created_at` | `timestamptz` | Registration timestamp |

> **Trigger:** `on_participant_created` → automatically creates a wallet with 1,000,000 coins and logs an `INITIAL_BALANCE` transaction.

---

#### `wallets`
Financial ledger holding coin balances per participant.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Unique identifier |
| `participant_id` | `uuid` (FK → participants, UNIQUE) | 1:1 relationship |
| `balance` | `numeric` (default: 1,000,000) | Available liquid balance |
| `in_play` | `numeric` (default: 0) | Coins locked in pending predictions |
| `updated_at` | `timestamptz` | Last modification timestamp |

> **Invariant:** `balance + in_play = Σ(transaction amounts)` for each participant.

---

#### `matches`
Full fixture log for all 104 World Cup matches.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Unique identifier |
| `api_match_id` | `text` (UNIQUE) | External API identifier |
| `home_team` / `away_team` | `text` | Team names |
| `home_team_code` / `away_team_code` | `text` | 3-letter FIFA codes (e.g., `BRA`, `ARG`) |
| `home_logo_url` / `away_logo_url` | `text` | Team crest/flag URLs |
| `kickoff_utc` | `timestamptz` | Scheduled kickoff in UTC |
| `stage` | `text` | `GROUP`, `R32`, `R16`, `QF`, `SF`, `3RD`, `FINAL` |
| `group_name` | `text` | Group letter (A–L) for group stage matches |
| `status` | `text` | `NS` → `LIVE` → `HT` → `FT` / `AET` / `PEN` / `CANC` / `PST` |
| `home_score` / `away_score` | `integer` | Match scores |
| `result` | `text` | `HOME_WIN`, `AWAY_WIN`, `DRAW`, `HOME_ADVANCE`, `AWAY_ADVANCE` |
| `resolved` | `boolean` | Whether payouts have been processed |
| `prediction_close` | `timestamptz` | Calculated as `kickoff_utc − 1 hour` |

---

#### `predictions`
Record of participant stakes on match outcomes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Unique identifier |
| `participant_id` | `uuid` (FK → participants) | Who placed the prediction |
| `match_id` | `uuid` (FK → matches) | Which match |
| `prediction` | `text` | `HOME_WIN`, `AWAY_WIN`, `DRAW`, `HOME_ADVANCE`, `AWAY_ADVANCE` |
| `stake` | `numeric` (≥ 1,000) | Coins wagered |
| `status` | `text` | `PENDING` → `WON` / `LOST` / `REFUNDED` |
| `payout` | `numeric` | Coins returned on win (null until resolved) |

> **Constraint:** `UNIQUE(participant_id, match_id)` — one prediction per participant per match.

---

#### `transactions`
Immutable audit ledger for every wallet balance change.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Unique identifier |
| `participant_id` | `uuid` (FK → participants) | Associated participant |
| `match_id` | `uuid` (FK → matches) | Related match (optional) |
| `prediction_id` | `uuid` (FK → predictions, ON DELETE SET NULL) | Related prediction |
| `type` | `text` | `INITIAL_BALANCE`, `STAKE`, `UPDATE_STAKE`, `PAYOUT`, `REFUND`, `ADJUSTMENT` |
| `amount` | `numeric` | Positive = credit, Negative = debit |
| `balance_after` | `numeric` | Balance snapshot after this transaction |
| `note` | `text` | Human-readable description |

---

#### `leaderboard_snapshots`
Ranking snapshots captured after each match resolution.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Unique identifier |
| `match_id` | `uuid` (FK → matches) | Triggering match |
| `snapshot` | `jsonb` | Array of `{participant_id, name, balance, rank}` |
| `created_at` | `timestamptz` | Snapshot timestamp |

---

#### `notifications_log`
Event tracking for Telegram notifications and sync operations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` (PK) | Unique identifier |
| `type` | `text` | `MATCH_START`, `MATCH_RESULT`, `REMINDER`, etc. |
| `match_id` | `uuid` (FK → matches) | Associated match |
| `payload` | `jsonb` | Full notification payload |
| `sent_at` | `timestamptz` | Time sent |
| `status` | `text` | `PENDING` → `SENT` / `FAILED` |
| `error` | `text` | Error message if failed |

---

### Database Functions (RPCs)

All wallet mutations are handled by these transactional PL/pgSQL functions:

| Function | Purpose | Key Safety Features |
|----------|---------|-------------------|
| `place_prediction(participant_id, match_id, prediction, stake)` | Place a new prediction | `FOR UPDATE` lock on wallet; validates deadline, balance, and uniqueness |
| `update_prediction(prediction_id, new_prediction, new_stake)` | Modify an existing prediction | Locks both prediction and wallet; computes stake delta |
| `cancel_prediction(prediction_id)` | Cancel and refund a prediction | Refunds stake to balance; logs `REFUND` transaction; deletes prediction |
| `create_wallet_for_new_participant()` | Auto-create wallet on signup | Trigger function; creates wallet + `INITIAL_BALANCE` transaction |
| `calc_prediction_close(ts)` | Calculate prediction lockout time | Returns `ts − 1 hour` |
| `resolve_match_predictions(match_id)` | Process payouts after match ends | Applies proportional redistribution formula |

---

### PostgreSQL Extensions

| Extension | Purpose |
|-----------|---------|
| `plpgsql` | Procedural language for database functions |
| `pgcrypto` | Cryptographic hashes and UUID generation |
| `uuid-ossp` | UUID generation algorithms |
| `pg_cron` | Background job scheduling (live score polling, notification retries) |
| `pg_stat_statements` | Query performance monitoring |
| `supabase_vault` | Secure credential storage for API keys and tokens |
| `pg_net` | Async HTTP requests from database triggers to Edge Functions |

---

## ⚙ Edge Functions & Backend Logic

Four Supabase Edge Functions (Deno runtime) power the server-side logic:

### 1. `sync-fixtures`
**Purpose:** Fetch and upsert all WC2026 fixtures from the football data API.

- Pulls all 104 matches for WC2026 season from API-Football
- Maps API response to the `matches` table schema
- Upserts records using `api_match_id` as the unique key
- Calculates `prediction_close` as `kickoff_utc − 1 hour`
- Handles both group stage and knockout round fixtures
- Designed to run once before tournament start, then periodically to catch schedule changes

### 2. `sync-scores`
**Purpose:** Poll live scores and trigger match resolution when matches finish.

- Polls API-Football every 60 seconds during active match windows
- Updates `status`, `home_score`, `away_score` in the `matches` table
- Detects when a match transitions to `FINISHED` / `FT` / `AET` / `PEN`
- Determines the correct `result` value based on scores and stage
- Triggers the payout resolution workflow:
  1. Reads all predictions for the finished match
  2. Separates correct vs incorrect predictions
  3. Applies proportional redistribution formula
  4. Updates wallet balances for all participants
  5. Creates transaction records for every payout/loss
  6. Sets prediction statuses to `WON` / `LOST`
  7. Saves a leaderboard snapshot
  8. Fires Telegram notifications

### 3. `telegram-webhook`
**Purpose:** Telegram Bot webhook handler for pairing and event notifications.

**Inbound (Bot Commands):**
- `/start` — Returns pairing instructions
- `/start <participant_uuid>` — Deep-link pairing: verifies UUID in database, saves `telegram_chat_id`, sends personalized welcome message with current balance

**Outbound (Event Notifications):**
- `prediction_placed` — Staking confirmation with coin amount and new balance
- `prediction_updated` — Before/after diff showing changes in choice and stake
- `prediction_cancelled` — Refund confirmation with updated balance
- `prediction_resolved` — Win/loss alert with team names, flags, and net profit/loss amounts

**Message Format:** Uses Telegram MarkdownV2 with country flag emojis derived from ISO codes, bold participant names, and monospace balance figures.

### 4. `retry-notifications`
**Purpose:** Resilient delivery of failed Telegram notifications.

- Queries `notifications_log` for entries with `status = 'FAILED'` and retry count < 3
- Retries sending via the Telegram Bot API
- Implements exponential backoff (1s → 5s → 30s)
- Updates notification status to `SENT` on success or increments retry counter on failure
- Designed to run as a `pg_cron` scheduled job

---

## 🤖 Telegram Bot Integration

The platform includes a fully automated Telegram notifications bridge:

```
            ┌─────────────────┐
            │  Telegram User  │
            └────────┬────────┘
                     │ Sends /start <UUID>
                     ▼
          ┌──────────────────────┐
          │  Telegram Bot API    │
          │  Webhook Endpoint    │
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  Supabase Edge Fn    │
          │  telegram-webhook    │
          └──────────┬───────────┘
                     │ 1. Verify UUID in Postgres
                     │ 2. Save chat_id & telegram_user
                     │ 3. Return welcome message
                     ▼
          ┌──────────────────────┐
          │  PostgreSQL Database │
          └──────────────────────┘
```

### Pairing Flow
1. User navigates to **Profile Settings** in the web app
2. Clicks "Link Telegram" — generates a deep link: `https://t.me/botname?start=<participant_uuid>`
3. Opens Telegram, taps "Start" — bot receives the UUID
4. Edge Function verifies the UUID, stores the `telegram_chat_id`, responds with a welcome message

### Notification Types

| Event | Trigger | Content |
|-------|---------|---------|
| **Prediction Placed** | User stakes on a match | Team names + flags, stake amount, new balance |
| **Prediction Updated** | User modifies prediction | Before/after diff: old→new choice, old→new stake |
| **Prediction Cancelled** | User cancels prediction | Refund amount, updated balance |
| **Match Resolved** | Match reaches FINISHED | Win/Loss result, net profit or loss, team name + flag |

---

## 🧮 Prediction & Payout Logic

### Design Principles
The payout system satisfies three constraints:
1. **Zero-sum per match** — Total coins redistributed = total coins lost by incorrect predictors
2. **Proportional reward** — A correct predictor who risked more wins more
3. **Explainable** — "Losers' stakes are pooled and split among winners in proportion to how much each winner staked"

### Formula: Proportional Redistribution

```
Let:
  P       = total staked by all participants with the LOSING prediction(s)
  Cᵢ      = stake placed by participant i on the CORRECT outcome
  C_total = sum of all stakes on the CORRECT outcome

For each correct predictor i:
  payout_i  = Cᵢ + (Cᵢ / C_total) × P
  net_gain  = (Cᵢ / C_total) × P
```

### Worked Example

| Participant | Prediction | Stake | Result |
|-------------|-----------|-------|--------|
| Alice | Home Win ✅ | 50,000 | **Winner** |
| Bob | Home Win ✅ | 100,000 | **Winner** |
| Carol | Away Win ❌ | 30,000 | **Loser** |
| Dave | Draw ❌ | 20,000 | **Loser** |

- **Losing pool P** = 30,000 + 20,000 = **50,000 coins**
- **C_total** = 50,000 + 100,000 = **150,000 coins**
- **Alice payout** = 50,000 + (50,000/150,000) × 50,000 = **66,667 coins** (+16,667 profit)
- **Bob payout** = 100,000 + (100,000/150,000) × 50,000 = **133,333 coins** (+33,333 profit)
- **Verification:** 66,667 + 133,333 = 200,000 = original correct stakes + losing pool ✅

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| **No correct predictors** | All stakes refunded in full |
| **Only one winner** | Winner receives their stake + entire losing pool |
| **Cancelled match** | All stakes refunded; match set to `CANCELLED` |
| **Postponed match** | Predictions remain valid; window reopens if new kickoff > 60 min away |
| **Extra time / Penalties** | Knockout predictions resolved by eventual qualifier, not 90-min result |
| **Rounding remainder** | Distributed to the participant with the largest stake among winners |
| **Insufficient balance** | Rejected at the RPC layer; stake must ≤ available balance |
| **Late submission** | Rejected at both API and UI layers after `prediction_close` |
| **Duplicate prediction** | Treated as update (upsert); previous stake released, new stake reserved |

---

## 🎨 Frontend Components

### Identity Selector (`IdentitySelector.tsx`)
The welcome screen. Displays a grid of participant profile cards with photos. On selection:
- If PIN is set → shows a keypad for authentication
- If no PIN → prompts to create a 4-digit PIN
- Persists session via `localStorage`

### Dashboard (`Dashboard.tsx`)
The main hub with three tabbed views:
1. **Live & Highlights** — In-progress matches, upcoming games, and recent results
2. **Group Stage** — Groups A through L with filter buttons
3. **Knockout Rounds** — R32 through to the Final

Includes a "Sync Live Scores" button that triggers the `sync-scores` Edge Function.

### Match Card (`MatchCard.tsx`)
Individual fixture card displaying:
- Team logos and country flag emojis
- Kickoff time (converted to local timezone)
- Stage/group label
- Live score (if in progress)
- Prediction status: Open → Locked → Won → Lost
- Edit/Cancel buttons when prediction window is open

### Prediction Modal (`PredictionModal.tsx`)
Full-screen bottom sheet (mobile) or center modal (desktop):
- Three outcome buttons for group stage, two for knockouts
- Coin stake slider with preset percentage buttons
- Available balance display
- Confirmation summary before submission

### Leaderboard (`Leaderboard.tsx`)
- **Top 3 Podium** — 3D-style cards with gold/silver/bronze accents and elevation
- **Full Rankings List** — All participants with rank, photo, name, balance, and delta
- **Rank Change Arrows** — `↑` / `↓` indicators with magnitude

### Prediction History (`PredictionHistory.tsx`)
- Filterable list of all past predictions
- Win/Loss badges with color coding
- Expandable details showing stake, payout, and formula breakdown

### Profile Settings (`ProfileSettings.tsx`)
- Edit display name
- Upload custom profile photo to Supabase Storage
- Set/change 4-digit PIN
- Link Telegram account via deep-link pairing

### Top Navigation (`TopNav.tsx`)
- App branding and page navigation (Dashboard, Leaderboard, History)
- Persistent balance chip showing available coins and in-play amount
- User avatar link to profile settings

### Page Transition Engine (`TransitionOverlay.tsx` + `usePageTransition.ts`)
A custom cinematic transition system:
1. Plays a fullscreen video overlay (`/assets/transition.mp4`)
2. At the video midpoint, `flushSync()` swaps the page component
3. Video completes, opacity fades to 0, revealing the new page
4. Safety features: motion preference detection, 500ms start grace, 2200ms hard timeout

---

## 🎨 Design System

### Color Palette
The UI uses the official FIFA World Cup 2026 brand-inspired palette, defined as CSS custom properties:
- Vibrant primary colors inspired by the WC2026 identity
- Full dark mode support with system detection
- Glassmorphism effects with `backdrop-filter: saturate(160%) blur(24px)`
- Semi-transparent borders and surfaces

### Typography
| Font | Usage | Source |
|------|-------|--------|
| **FWC2026-SemiExpandedBlack** | Headlines, hero text, branding | Self-hosted `.ttf` |
| **Guesswhat-Exceptional** | Accent text, special callouts | Self-hosted `.otf` |
| **Inter** | Body text, UI labels, data | Google Fonts |

### UX Patterns
- **Countdown Clock** — Color transitions: neutral → amber (24h) → red (1h) → `LOCKED`
- **Balance Animation** — Count-up (win) or count-down (loss) over ~1.5s with floating delta
- **Prediction Confirmation** — Haptic-style pulse animation on the Confirm button
- **Empty State** — Encouraging prompt: "You haven't predicted this match yet. X minutes left."
- **Locked State** — Greyed-out card with padlock icon showing locked-in prediction

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x
- A **Supabase** project (free tier works for development)
- (Optional) **Supabase CLI** for Edge Function deployment

### Installation

```bash
# Clone the repository
git clone https://github.com/Abdulrhman-Alshehri/WC2026.git
cd WC2026

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start Vite dev server with HMR |
| `build` | `npm run build` | TypeScript compile + Vite production build |
| `preview` | `npm run preview` | Preview the production build locally |
| `lint` | `npm run lint` | Run ESLint on the codebase |

---

## 🔐 Environment Variables

### Frontend (Vite)
Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Note:** The app includes fallback values for the production Supabase project, so it works out of the box for pool participants.

### Supabase Edge Functions (Secrets)
Set these via the Supabase Dashboard or CLI:

```bash
# Football data API key
supabase secrets set API_FOOTBALL_KEY=your-api-football-key

# Telegram Bot token (NEVER commit to source code)
supabase secrets set TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Telegram group chat ID
supabase secrets set TELEGRAM_CHAT_ID=your-group-chat-id
```

---

## 🌐 Deployment

### Netlify (Current Production)

The app is configured for Netlify deployment via `netlify.toml`:

```toml
[build]
  command = "npm install && npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Deployment steps:**
1. Connect your GitHub repository to Netlify
2. Netlify auto-detects the build settings from `netlify.toml`
3. Every push to `main` triggers a new deployment
4. The SPA redirect rule ensures client-side routing works correctly

### Supabase Edge Functions

Deploy Edge Functions using the Supabase CLI:

```bash
# Deploy all functions
supabase functions deploy sync-fixtures
supabase functions deploy sync-scores
supabase functions deploy telegram-webhook
supabase functions deploy retry-notifications

# Set secrets (one-time)
supabase secrets set TELEGRAM_BOT_TOKEN=your-token
supabase secrets set API_FOOTBALL_KEY=your-key
```

---

## 🧪 Testing

### Backend Testing Scripts

The repository includes several scripts for validating the Supabase connection and data integrity:

| Script | Language | Purpose |
|--------|----------|---------|
| `test.js` | JavaScript | Connects to Supabase, queries `matches` table ordered by kickoff time |
| `test.ts` | TypeScript | Same as above with type safety |
| `test_endpoints.py` | Python | Tests multiple Supabase REST endpoints across schemas |
| `test_supabase.py` | Python | Queries `/rest/v1/wallets` for balances and participant details |
| `test_supabase_france.py` | Python | Queries for a specific France vs Germany match |

### Running Tests

```bash
# JavaScript test (requires .env file)
node test.js

# TypeScript test (requires ts-node or tsx)
npx tsx test.ts

# Python tests (requires requests library)
pip install requests
python test_endpoints.py
python test_supabase.py
python test_supabase_france.py
```

---

## 🏆 Tournament Format

### FIFA World Cup 2026 — Key Facts

| Metric | Value |
|--------|-------|
| **Dates** | June 11 – July 19, 2026 |
| **Host Countries** | 🇺🇸 United States, 🇨🇦 Canada, 🇲🇽 Mexico |
| **Teams** | 48 (expanded from 32) |
| **Groups** | 12 groups of 4 teams (A through L) |
| **Total Matches** | 104 |
| **Group Stage** | June 11 – June 27 |
| **Knockout Stage** | June 28 – July 19 |
| **Final** | July 19, MetLife Stadium, New Jersey |

### Group Stage
- 12 groups × 4 teams = 48 teams
- Round-robin within each group (3 matches per team)
- Top 2 from each group + 8 best 3rd-placed teams advance
- **24 teams → Round of 32 → Round of 16 → QF → SF → Final**

### Tie-Breaking Criteria
1. Points in head-to-head matches
2. Goal difference in head-to-head
3. Goals scored in head-to-head
4. (Reapply 1–3 if still tied)
5. Overall goal difference
6. Overall goals scored
7. Fair play score
8. FIFA World Ranking

### Knockout Stage
- Single elimination from Round of 32 to Final
- Extra time (30 min) if level after 90 minutes
- Penalty shootout if still tied after extra time
- Third-place match on July 18

---

## 👥 Participants

The following 11 participants are confirmed for the WC2026 pool:

| # | Name | Profile |
|---|------|---------|
| 1 | **Abdulrhman** | 📸 `images/Abdulrhman.png` |
| 2 | **Aseel** | 📸 `images/Aseel.png` |
| 3 | **Bijad** | 📸 `images/Bijad.png` |
| 4 | **Haddad** | 📸 `images/Haddad.png` |
| 5 | **Hussam** | 📸 `images/Hussam.png` |
| 6 | **Ibrahim** | 📸 `images/Ibrahim.png` |
| 7 | **Khatrawi** | 📸 `images/Khatrawi.png` |
| 8 | **Obaid** | 📸 `images/Obaid.png` |
| 9 | **Saleh** | 📸 `images/Saleh.png` |
| 10 | **Turkis** | 📸 `images/Turkis.png` |
| 11 | **Yousef** | 📸 `images/Yousef.png` |

> Each participant starts with **1,000,000 virtual coins**. No real money is involved — this is purely for bragging rights! 🏆

---

## 🗺 Roadmap & Phase 2 Ideas

### ✅ Completed (MVP)
- [x] Identity selector with PIN authentication
- [x] Full match fixture display for all 104 WC2026 matches
- [x] Group-stage & knockout-stage predictions with custom stakes
- [x] Automated prediction window closure (1h before kickoff)
- [x] Proportional redistribution payout formula
- [x] Automated match resolution with live score polling
- [x] Real-time leaderboard with Supabase Realtime
- [x] Balance display and transaction history
- [x] Telegram bot: deadline reminders + standings updates
- [x] Custom branding (FWC2026 font + color palette)
- [x] Mobile-responsive glassmorphism design
- [x] Dark/light theme support
- [x] Profile settings with avatar upload
- [x] Cinematic page transition engine
- [x] Add new user flow from identity selector
- [x] Notification retry system for resilient Telegram delivery

### 🔮 Phase 2 Ideas
- [ ] **Golden Boot Prediction** — Side-wager on the tournament's top scorer
- [ ] **Bracket Predictor** — Predict the entire knockout bracket before it begins for bonus points
- [ ] **Fixed-Odds Mode** — Operator-set odds per match for a higher-stakes feel
- [ ] **Social Layer** — Reactions on match cards, in-app group chat tab
- [ ] **Browser Push Notifications** — Web Push API to supplement Telegram
- [ ] **Balance Trajectory Charts** — Historical charts of each participant's balance over time
- [ ] **Multi-Pool Support** — Run separate pools for different friend groups from one codebase
- [ ] **Admin Portal** — Participant management, manual match override, transaction audit log
- [ ] **Daily Digest** — Automated 08:00 AM message listing matches scheduled for that day

---

## 🤝 Contributing

This is a **private project** built for a specific group of friends. However, if you're a participant and want to contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

### Commit Convention
We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` — New features
- `fix:` — Bug fixes
- `docs:` — Documentation changes
- `style:` — Code style changes (formatting, etc.)
- `refactor:` — Code refactoring
- `security:` — Security improvements

---

## 📄 License

This project is **private and proprietary**. It is not licensed for public use, distribution, or modification outside the authorized participant group.

---

<p align="center">
  <strong>⚽ Built with passion for the beautiful game ⚽</strong>
  <br />
  <em>WC2026 X El Casino — May the best predictor win! 🏆</em>
</p>

<p align="center">
  <sub>Made with ❤️ by the WC2026 Pool crew</sub>
</p>
