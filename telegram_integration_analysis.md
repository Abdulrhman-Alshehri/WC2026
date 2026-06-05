# Telegram Integration — Full System Analysis

> **Purpose of this document:** Provide a complete, authoritative reference to every aspect of the WC2026 Prediction Pool's Telegram integration. Written for AI assistants, developers, and debugging sessions. Every code path, data field, message template, error handling branch, and retry mechanism is documented with exact file paths and line numbers.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Component Map](#3-component-map)
4. [Bot Identity & Configuration](#4-bot-identity--configuration)
5. [Pairing Flow (Deep-Link)](#5-pairing-flow-deep-link)
6. [Notification Types — Complete Reference](#6-notification-types--complete-reference)
7. [Notification Trigger Sources](#7-notification-trigger-sources)
8. [Message Rendering & Formatting](#8-message-rendering--formatting)
9. [Notification Logging (`notifications_log`)](#9-notification-logging-notifications_log)
10. [Retry System (`retry-notifications`)](#10-retry-system-retry-notifications)
11. [Database Trigger: Match Resolution Notifications](#11-database-trigger-match-resolution-notifications)
12. [Frontend Integration Points](#12-frontend-integration-points)
13. [Security Model](#13-security-model)
14. [Error Handling — Complete Matrix](#14-error-handling--complete-matrix)
15. [Data Flow Diagrams — Per Event Type](#15-data-flow-diagrams--per-event-type)
16. [Environment Variables & Secrets](#16-environment-variables--secrets)
17. [Known Limitations & Edge Cases](#17-known-limitations--edge-cases)
18. [Quick Reference: Code Locations](#18-quick-reference-code-locations)

---

## 1. System Overview

The Telegram integration is a **bidirectional notification bridge** between the WC2026 Prediction Pool web application and a private Telegram bot. It serves two purposes:

1. **Inbound:** Handles Telegram bot commands (`/start`, `/start <UUID>`) to pair a participant's Telegram account with their pool identity.
2. **Outbound:** Sends real-time alerts to paired participants when prediction events occur (placed, updated, cancelled, resolved).

### Key Design Decisions

- **All messages are sent server-side** via Supabase Edge Functions calling the Telegram Bot API. The frontend never directly calls the Telegram API.
- **Notifications are fire-and-forget from the caller's perspective.** The frontend invokes the Edge Function asynchronously (`.catch()` only) and does not wait for success.
- **Every notification is logged** in the `notifications_log` database table with the rendered message text, enabling the retry system to re-send failed messages without re-rendering.
- **Match resolution notifications** are triggered by a **PostgreSQL trigger** (not the frontend), ensuring they fire even if no user has the app open.

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        TRIGGER SOURCES                              │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │  Frontend (React) │  │  PostgreSQL       │  │  pg_cron           │ │
│  │  App.tsx           │  │  Trigger          │  │  Scheduled Job     │ │
│  │                    │  │  on_match_resolved│  │                    │ │
│  │  Events:           │  │                    │  │  retry-            │ │
│  │  • prediction_     │  │  Event:            │  │  notifications     │ │
│  │    placed          │  │  • prediction_     │  │                    │ │
│  │  • prediction_     │  │    resolved        │  │  (re-sends FAILED  │ │
│  │    updated         │  │                    │  │   entries from      │ │
│  │  • prediction_     │  │  Uses: pg_net      │  │   notifications_   │ │
│  │    cancelled       │  │  HTTP POST         │  │   log)              │ │
│  │  • test            │  │                    │  │                    │ │
│  └────────┬───────────┘  └────────┬───────────┘  └────────┬───────────┘ │
│           │                       │                       │             │
│           │ supabase.functions    │ net.http_post()        │ fetch()     │
│           │ .invoke()             │                        │             │
│           ▼                       ▼                        ▼             │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              SUPABASE EDGE FUNCTION                                │ │
│  │              telegram-webhook/index.ts                             │ │
│  │                                                                    │ │
│  │  1. Parse request body                                            │ │
│  │  2. Route by body.event (DB/app events) or body.message (bot cmd) │ │
│  │  3. Render Markdown message template                              │ │
│  │  4. POST to Telegram Bot API                                      │ │
│  │  5. Log to notifications_log (SENT or FAILED)                     │ │
│  └──────────────────────────────┬─────────────────────────────────────┘ │
│                                 │                                       │
│                                 │ HTTPS POST                            │
│                                 ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              TELEGRAM BOT API                                     │  │
│  │              https://api.telegram.org/bot{TOKEN}/sendMessage      │  │
│  │                                                                    │  │
│  │  parse_mode: 'Markdown'                                           │  │
│  │  chat_id: participant's telegram_chat_id                          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Map

| Component | File Path | Role |
|-----------|-----------|------|
| **Telegram Webhook Edge Function** | `supabase/functions/telegram-webhook/index.ts` (368 lines) | Core handler: processes both inbound bot commands and outbound notification events |
| **Retry Notifications Edge Function** | `supabase/functions/retry-notifications/index.ts` (114 lines) | Re-sends `FAILED` notifications from the last 2 hours (max 3 retries each) |
| **Match Resolution DB Trigger** | `supabase/migrations/20260525_add_prediction_resolved_trigger.sql` (100 lines) | PostgreSQL trigger that fires `prediction_resolved` notifications via `pg_net` when a match is resolved |
| **Match Resolution DB Function** | `supabase/migrations/20260526_add_resolve_match_predictions.sql` (129 lines) | The payout function that sets `matches.resolved = true`, which fires the trigger above |
| **Frontend: Prediction Handlers** | `src/App.tsx` (lines 274–408) | Invokes `telegram-webhook` for `prediction_placed`, `prediction_updated`, `prediction_cancelled` events |
| **Frontend: Profile Settings** | `src/components/ProfileSettings.tsx` (lines 298–614) | Telegram pairing UI, test message sender, unlink button |
| **Frontend: Supabase Client** | `src/lib/supabase.ts` | Used by App.tsx and ProfileSettings.tsx to invoke Edge Functions |
| **Notification Log Table** | `notifications_log` (PostgreSQL table) | Persistent log of every notification attempt, including rendered message text |
| **Participant Table** | `participants` (PostgreSQL table) | Stores `telegram_chat_id` and `telegram_user` columns for paired accounts |

---

## 4. Bot Identity & Configuration

| Property | Value |
|----------|-------|
| **Bot Username** | `@WC2026_El_casino_bot` |
| **Bot Token Location** | Supabase Edge Function Secret: `TELEGRAM_BOT_TOKEN` |
| **Token Reference** | `Deno.env.get("TELEGRAM_BOT_TOKEN")` in all Edge Functions |
| **Telegram API Base URL** | `https://api.telegram.org/bot{TOKEN}/sendMessage` |
| **Message Parse Mode** | `Markdown` (MarkdownV1, not MarkdownV2) |
| **Deep Link URL Pattern** | `https://t.me/WC2026_El_casino_bot?start={participant_uuid}` |

### Bot Token Security Rules

1. Token is **never** in source code or committed files
2. Token is stored as a Supabase Edge Function secret via `supabase secrets set TELEGRAM_BOT_TOKEN=<value>`
3. The database trigger retrieves the Supabase **service role key** (not the bot token) from `vault.decrypted_secrets` to authenticate its Edge Function call; the Edge Function then reads the bot token from its own environment
4. Frontend code never sees or transmits the bot token

---

## 5. Pairing Flow (Deep-Link)

### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: User opens Profile Settings on the web app                │
│                                                                     │
│  ProfileSettings.tsx renders a link:                                │
│  <a href="https://t.me/WC2026_El_casino_bot?start={UUID}">         │
│     Pair Telegram Bot                                               │
│  </a>                                                               │
│  where {UUID} = participant.id (from Supabase participants table)   │
│                                                                     │
│  Source: src/components/ProfileSettings.tsx:606                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ User clicks link → opens Telegram
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: Telegram opens bot chat with /start {UUID}                │
│                                                                     │
│  User presses "Start" button in Telegram                           │
│  Telegram sends an Update to the webhook:                          │
│  {                                                                  │
│    "message": {                                                     │
│      "text": "/start 550e8400-e29b-41d4-a716-446655440000",        │
│      "chat": { "id": 123456789 },                                  │
│      "from": { "username": "john_doe", "first_name": "John" }      │
│    }                                                                │
│  }                                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Webhook receives POST
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: Edge Function processes /start command                    │
│                                                                     │
│  telegram-webhook/index.ts:255-345                                  │
│                                                                     │
│  a) Extract UUID from message text (parts[1])                      │
│  b) Validate UUID format with regex:                                │
│     /^[0-9a-fA-F]{8}-...-[0-9a-fA-F]{12}$/                       │
│  c) Fetch participant from DB:                                      │
│     SELECT id, name, display_name FROM participants WHERE id = UUID │
│  d) If not found → send error message → return                     │
│  e) Update participant record:                                      │
│     UPDATE participants SET telegram_chat_id = chatId,              │
│                             telegram_user = username                 │
│     WHERE id = UUID                                                 │
│  f) Fetch wallet balance:                                           │
│     SELECT balance FROM wallets WHERE participant_id = UUID         │
│  g) Send welcome message with formatted balance                    │
│  h) Log notification as 'TELEGRAM_WELCOME' in notifications_log    │
└─────────────────────────────────────────────────────────────────────┘
```

### Welcome Message Template (Sent on Successful Pairing)

```
⚽ *Welcome to FWC 2026 Predictions, {displayName}!* 🏆

Your Telegram account is now *successfully linked* to your prediction wallet! 🤝

You will receive real-time updates directly in this chat:
🔔 *Live match events* (kickoffs, goals)
⚠️ *Prediction deadline reminders* (1 hour before lockout)
💰 *Staking results* & payout summaries

💎 *Current Balance:* `{formattedBalance} Coins`

Good luck with your predictions! ⚽🔥
```

### Pairing Error Handling

| Condition | Error Message Sent to User | HTTP Response |
|-----------|---------------------------|---------------|
| UUID not found in `participants` table | `⚠️ *Link Failed*: Could not find a matching prediction pool account...` | `{ success: false, error: "Participant not found" }` (200) |
| Database update fails | `⚠️ *Database Error*: We encountered an error linking your account...` | `{ success: false, error: "Database update error" }` (200) |
| `/start` without UUID parameter | Sends pairing instructions (not an error) | `{ success: true }` (200) |
| Non-`/start` command | Sends help text listing available commands | `{ success: true }` (200) |

### Unpairing Flow

The user can unlink their Telegram from `ProfileSettings.tsx:336-358`:

1. User clicks "Unlink Bot" button
2. Confirm dialog shown (`window.confirm`)
3. On confirm: `UPDATE participants SET telegram_chat_id = null, telegram_user = null WHERE id = {participant_id}`
4. Local state updated, queries invalidated
5. No notification is sent to Telegram on unlink

---

## 6. Notification Types — Complete Reference

### 6.1. `test`

| Property | Value |
|----------|-------|
| **Trigger Source** | Frontend: `ProfileSettings.tsx:298-334` |
| **Log Type** | `TELEGRAM_TEST` |
| **Purpose** | Verify Telegram pairing is working |

**Payload shape sent to Edge Function:**
```json
{
  "event": "test",
  "chat_id": "123456789",
  "data": {
    "balance": "1,000,000"
  }
}
```

**Rendered message template:**
```
🔔 *FWC 2026 Prediction Pool Notification Test*

Your Telegram pairing is active and working perfectly! 🎉

💰 *Current Balance:* `1,000,000 Coins`

You will receive alerts here for goal scores and predictions resolution! ⚽🤖
```

---

### 6.2. `prediction_placed`

| Property | Value |
|----------|-------|
| **Trigger Source** | Frontend: `App.tsx:274-293` |
| **Log Type** | `TELEGRAM_PREDICTION_PLACED` |
| **Purpose** | Confirm a new prediction was successfully staked |

**Payload shape sent to Edge Function:**
```json
{
  "event": "prediction_placed",
  "chat_id": "123456789",
  "data": {
    "match_id": "uuid-of-match",
    "stake": 50000,
    "home_team": "Brazil",
    "away_team": "Japan",
    "home_team_code": "BRA",
    "away_team_code": "JPN",
    "prediction": "HOME_WIN",
    "balance": 950000
  }
}
```

**Rendered message template:**
```
🎯 *Prediction Placed!* ⚽

You successfully staked *50,000 Coins* on the match:
🆚 *Brazil vs Japan*
📝 *Your Choice:* `HOME_WIN`

💎 *New Liquid Balance:* `950,000 Coins`

Good luck! 🏆
```

**Trigger condition:** `currentUser.telegram_chat_id` exists AND `matchObj` was found AND `place_prediction` RPC succeeded.

---

### 6.3. `prediction_updated`

| Property | Value |
|----------|-------|
| **Trigger Source** | Frontend: `App.tsx:335-355` |
| **Log Type** | `TELEGRAM_PREDICTION_UPDATED` |
| **Purpose** | Show before/after diff when a prediction is modified |

**Payload shape sent to Edge Function:**
```json
{
  "event": "prediction_updated",
  "chat_id": "123456789",
  "data": {
    "match_id": "uuid-of-match",
    "home_team": "Brazil",
    "away_team": "Japan",
    "home_team_code": "BRA",
    "away_team_code": "JPN",
    "old_prediction": "HOME_WIN",
    "new_prediction": "DRAW",
    "old_stake": 50000,
    "new_stake": 75000,
    "balance": 925000
  }
}
```

**Rendered message template (both changed):**
```
✏️ *Prediction Updated!* ⚽

🆚 *Brazil vs Japan*

📝 *Choice:* `HOME_WIN → DRAW`
💰 *Stake:* `50,000 → 75,000 Coins`

💎 *New Liquid Balance:* `925,000 Coins`
```

**Rendering logic:** The Edge Function (`telegram-webhook/index.ts:181-198`) conditionally includes diff lines:
- If `old_prediction !== new_prediction` → shows "Choice:" line
- If `Number(old_stake) !== Number(new_stake)` → shows "Stake:" line
- If neither changed (same prediction and stake submitted), the message still renders but with no diff lines

**Trigger condition:** `currentUser.telegram_chat_id` exists AND `matchObj` exists AND `oldPrediction` and `oldStake` are not undefined AND `update_prediction` RPC succeeded.

---

### 6.4. `prediction_cancelled`

| Property | Value |
|----------|-------|
| **Trigger Source** | Frontend: `App.tsx:392-408` |
| **Log Type** | `TELEGRAM_PREDICTION_CANCELLED` |
| **Purpose** | Confirm cancellation and refund |

**Payload shape sent to Edge Function:**
```json
{
  "event": "prediction_cancelled",
  "chat_id": "123456789",
  "data": {
    "match_id": "uuid-of-match",
    "stake": 50000,
    "home_team": "Brazil",
    "away_team": "Japan",
    "balance": 1000000
  }
}
```

**Rendered message template:**
```
❌ *Prediction Cancelled!*

Your prediction on *Brazil vs Japan* has been cancelled.
💰 *Stake Refunded:* `+50,000 Coins`

💎 *New Liquid Balance:* `1,000,000 Coins`
```

**Note on balance calculation:** The frontend calculates `refundBalance = balance + Number(predObj.stake)` at `App.tsx:394`. This is an approximation — the actual refund is processed server-side by the `cancel_prediction` RPC, and the balance shown may differ by the time the notification is sent. The approximation is used because the cancel RPC response doesn't always return the exact new balance in time.

---

### 6.5. `prediction_resolved`

| Property | Value |
|----------|-------|
| **Trigger Source** | **PostgreSQL Trigger** (`on_match_resolved`) — NOT the frontend |
| **Log Type** | `TELEGRAM_PREDICTION_RESOLVED` |
| **Purpose** | Inform participant of win or loss after match finishes |

**This is the ONLY notification type that is triggered from the database, not the frontend.** This ensures resolution notifications fire even if no user is online.

**Payload shape sent to Edge Function (constructed by the SQL trigger):**
```json
{
  "event": "prediction_resolved",
  "chat_id": "123456789",
  "data": {
    "match_id": "uuid-of-match",
    "home_team": "Brazil",
    "away_team": "Japan",
    "home_team_code": "BRA",
    "away_team_code": "JPN",
    "home_score": 3,
    "away_score": 0,
    "prediction": "HOME_WIN",
    "status": "WON",
    "stake": 50000,
    "payout": 83333,
    "profit": 33333,
    "balance": 1033333
  }
}
```

**Rendered message — WIN variant:**
```
🎉 *Staking Win! Payout Processed!* 💰

Match *Brazil vs Japan* is resolved.
🏁 *Result:* `3 - 0`

📈 *Prediction:* `HOME_WIN` (WON)
💸 *Staked:* `50,000 Coins`
🎁 *Net Payout:* `+83,333 Coins` (Profit: +33,333 Coins) 🎉

💎 *New Liquid Balance:* `1,033,333 Coins`
```

**Rendered message — LOSS variant:**
```
💔 *Prediction Settled*

Match *Brazil vs Japan* is resolved.
🏁 *Result:* `3 - 0`

📈 *Prediction:* `AWAY_WIN` (LOST)
💸 *Staked:* `50,000 Coins` (Lost)

💎 *New Liquid Balance:* `950,000 Coins`
```

**Trigger chain:**
```
sync-scores Edge Function detects match status = FINISHED
    │
    ▼
Calls resolve_match_predictions(match_id) RPC
    │ (settles all PENDING predictions → WON/LOST)
    │ (updates wallet balances)
    │ (writes transaction records)
    ▼
Sets matches.resolved = true
    │
    ▼
PostgreSQL AFTER UPDATE trigger on matches table fires
    │ (notify_predictions_resolved function)
    │
    ▼
FOR EACH settled prediction with a paired Telegram account:
    │ Calls net.http_post() → telegram-webhook Edge Function
    │ with event = 'prediction_resolved'
    ▼
Edge Function renders message and sends to Telegram Bot API
```

---

## 7. Notification Trigger Sources

### Summary Table

| Event | Trigger Source | Trigger Location | Transport Method |
|-------|---------------|-----------------|------------------|
| `test` | Frontend (user action) | `ProfileSettings.tsx:313` | `supabase.functions.invoke()` |
| `prediction_placed` | Frontend (after RPC success) | `App.tsx:277` | `supabase.functions.invoke()` |
| `prediction_updated` | Frontend (after RPC success) | `App.tsx:337` | `supabase.functions.invoke()` |
| `prediction_cancelled` | Frontend (after RPC success) | `App.tsx:396` | `supabase.functions.invoke()` |
| `prediction_resolved` | PostgreSQL trigger | `20260525...trigger.sql:60` | `net.http_post()` |
| *(retry)* | pg_cron job | `retry-notifications/index.ts:56` | Direct `fetch()` to Telegram API |

### Frontend vs Database Trigger — Design Rationale

| Aspect | Frontend-triggered (placed/updated/cancelled) | DB-triggered (resolved) |
|--------|----------------------------------------------|------------------------|
| **Why this trigger source?** | User is actively in the app and already has the context (match, prediction, balance) | Match resolution happens server-side via sync-scores; no user may be online |
| **Caller** | React component via `supabase.functions.invoke()` | PostgreSQL trigger via `pg_net.http_post()` |
| **Authentication** | Client's Supabase anon key | Supabase service role key from `vault.decrypted_secrets` |
| **Failure behavior** | `.catch()` logs error to console; user still sees toast | Logged in `notifications_log` as FAILED; retry system picks it up |
| **Chat ID source** | `currentUser.telegram_chat_id` from React state | `participants.telegram_chat_id` from database JOIN |

---

## 8. Message Rendering & Formatting

### Parse Mode

All messages use **Telegram Markdown v1** (`parse_mode: 'Markdown'`), set at `telegram-webhook/index.ts:41`.

### Markdown Escaping

The `escMd()` helper function at `telegram-webhook/index.ts:59-62` escapes special characters in dynamic strings:

```typescript
function escMd(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/([_*`\[])/g, '\\$1');
}
```

**Characters escaped:** `_`, `*`, `` ` ``, `[`

**Where it's used:** Applied to team names (which may contain special characters like parentheses). Not applied to numeric values wrapped in backticks (already safe).

### Coin Formatting

The `formatCoins()` helper at `telegram-webhook/index.ts:65-78` formats numbers with locale separators:

```typescript
function formatCoins(amount: number | string): string {
  // Handles: numbers, numeric strings, pre-formatted strings with commas
  // Uses: Intl.NumberFormat('en-US')
  // Output: "1,000,000"
}
```

**Input handling:**
- Already-formatted string with commas → returned as-is
- Numeric string → parsed, formatted
- Number → formatted
- NaN → returned as string

---

## 9. Notification Logging (`notifications_log`)

### Table Schema (as used by the code)

| Column | Type | Source | Purpose |
|--------|------|--------|---------|
| `id` | `uuid` (PK) | Auto-generated | Unique identifier |
| `type` | `text` | Set by Edge Function | e.g., `TELEGRAM_PREDICTION_PLACED`, `TELEGRAM_WELCOME` |
| `match_id` | `uuid` | From event payload | Associated match (null for test/welcome) |
| `payload` | `jsonb` | Full request body | Complete event data for debugging |
| `sent_at` | `timestamptz` | `new Date().toISOString()` | When the send was attempted |
| `status` | `text` | `'SENT'` or `'FAILED'` | Delivery result |
| `error` | `text` | From Telegram API or catch | Error message if failed |
| `message_text` | `text` | Rendered Markdown string | **The exact message sent to Telegram** — used by retry system |
| `retry_count` | `integer` | Incremented by retry system | How many times retry was attempted (default 0) |

### Logging Function

Defined at `telegram-webhook/index.ts:83-110`:

```typescript
async function logNotification(
  supabase: any,
  type: string,          // e.g. 'TELEGRAM_PREDICTION_PLACED'
  matchId: string | null,
  payload: any,          // full request body
  status: 'SENT' | 'FAILED',
  errorText: string | null = null,
  messageText: string | null = null  // rendered Telegram message
)
```

**Critical design:** The `message_text` field stores the **exact rendered Markdown** that was (or should have been) sent. This allows the retry system to re-send the message directly without needing to re-construct it from the payload.

### Notification Type Strings

| Type String | Event |
|-------------|-------|
| `TELEGRAM_TEST` | Test message from profile settings |
| `TELEGRAM_PREDICTION_PLACED` | New prediction staked |
| `TELEGRAM_PREDICTION_UPDATED` | Prediction modified |
| `TELEGRAM_PREDICTION_CANCELLED` | Prediction cancelled and refunded |
| `TELEGRAM_PREDICTION_RESOLVED` | Match resolved — win or loss |
| `TELEGRAM_WELCOME` | Successful pairing welcome message |

---

## 10. Retry System (`retry-notifications`)

### File: `supabase/functions/retry-notifications/index.ts`

### Trigger

Designed to run as a **pg_cron job every hour** (comment on line 4: "Runs every hour via pg_cron").

### Algorithm

```
1. Query notifications_log for entries where:
   - status = 'FAILED'
   - sent_at >= (now - 2 hours)    ← only retry recent failures
   - retry_count < 3               ← max 3 retry attempts
   - message_text IS NOT NULL       ← skip entries without stored message
   
2. For each failed entry:
   a. Extract chat_id from payload.chat_id or payload.data.telegram_chat_id
   b. Skip if no chat_id found
   c. Increment retry_count
   d. POST directly to Telegram Bot API:
      - URL: https://api.telegram.org/bot{TOKEN}/sendMessage
      - Body: { chat_id, text: entry.message_text, parse_mode: 'Markdown' }
   e. If Telegram responds OK:
      - UPDATE notifications_log SET status='SENT', retry_count=N,
        error='Recovered on retry N'
   f. If Telegram responds with error:
      - UPDATE notifications_log SET retry_count=N,
        error='Retry N failed [status]: error_body'
      - (status remains 'FAILED' for next retry attempt)
      
3. Return summary: { total, recovered, stillFailing }
```

### Key Design Details

| Aspect | Value |
|--------|-------|
| **Retry window** | 2 hours from `sent_at` |
| **Max retries** | 3 attempts |
| **Retry spacing** | Depends on pg_cron schedule (hourly = ~1h between retries) |
| **Message source** | `message_text` column — NOT re-rendered from payload |
| **Chat ID extraction** | First tries `payload.chat_id`, then `payload.data.telegram_chat_id` |
| **Does NOT create new log entries** | Updates the original FAILED entry in-place |
| **Direct API call** | Calls Telegram Bot API directly, does NOT invoke telegram-webhook Edge Function |

### Why Direct API Call (Not Edge Function)?

The retry function calls the Telegram API directly (`fetch()` to `api.telegram.org`) rather than re-invoking the `telegram-webhook` Edge Function. This avoids:
1. Infinite retry loops (Edge Function would log a new entry)
2. Re-rendering the message (which might fail if data has changed)
3. Extra function invocation costs

---

## 11. Database Trigger: Match Resolution Notifications

### File: `supabase/migrations/20260525_add_prediction_resolved_trigger.sql`

### Trigger Definition

```sql
CREATE TRIGGER on_match_resolved
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_predictions_resolved();
```

### Function Logic: `notify_predictions_resolved()`

```sql
-- Fires when: OLD.resolved IS DISTINCT FROM NEW.resolved
--             AND NEW.resolved = true
--             AND NEW.result IS NOT NULL

-- For each prediction on this match where:
--   status IN ('WON', 'LOST')
--   AND participant has telegram_chat_id
-- → Calls net.http_post() to telegram-webhook Edge Function
```

### Data Passed to Edge Function

The trigger constructs the payload using `jsonb_build_object`:

```sql
jsonb_build_object(
  'event',   'prediction_resolved',
  'chat_id', pred.telegram_chat_id,
  'data',    jsonb_build_object(
    'match_id',        NEW.id,
    'home_team',       NEW.home_team,
    'away_team',       NEW.away_team,
    'home_team_code',  NEW.home_team_code,
    'away_team_code',  NEW.away_team_code,
    'home_score',      NEW.home_score,
    'away_score',      NEW.away_score,
    'prediction',      pred.prediction,
    'status',          pred.status,        -- 'WON' or 'LOST'
    'stake',           pred.stake,
    'payout',          COALESCE(pred.payout, 0),
    'profit',          GREATEST(COALESCE(pred.payout, 0) - pred.stake, 0),
    'balance',         pred.balance        -- current wallet balance
  )
)
```

### Authentication

The trigger authenticates its Edge Function call using the **service role key** stored in Supabase Vault:

```sql
SELECT decrypted_secret INTO service_key
FROM vault.decrypted_secrets
WHERE name = 'service_role_key'
LIMIT 1;
```

This key is passed as a Bearer token in the `Authorization` header:

```sql
headers := jsonb_build_object(
  'Content-Type',  'application/json',
  'Authorization', 'Bearer ' || service_key
)
```

### Prerequisite

The service role key must be stored in Vault before the trigger can work:

```sql
SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
```

### Safety: Missing Key

If the key is not found in Vault, the function logs a `RAISE WARNING` and returns without sending any notifications:

```sql
IF service_key IS NULL THEN
  RAISE WARNING 'notify_predictions_resolved: service_role_key not found in vault...';
  RETURN NEW;
END IF;
```

---

## 12. Frontend Integration Points

### 12.1. App.tsx — Prediction Event Notifications

All three prediction events follow the same pattern:

```typescript
// 1. Check if user has paired Telegram
if (currentUser.telegram_chat_id && matchObj) {
  
  // 2. Invoke the Edge Function (fire-and-forget)
  supabase.functions.invoke('telegram-webhook', {
    body: {
      event: 'prediction_placed',  // or 'prediction_updated' or 'prediction_cancelled'
      chat_id: currentUser.telegram_chat_id,
      data: {
        match_id: matchId,
        stake: stake,
        home_team: matchObj.home_team,
        away_team: matchObj.away_team,
        // ... event-specific fields
        balance: data.new_balance
      }
    }
  }).catch(err => console.error("Failed to trigger Telegram notification:", err));
}
```

**Key behaviors:**
- **Guard clause:** `currentUser.telegram_chat_id` must be truthy
- **Fire-and-forget:** Uses `.catch()` only — does not `await`
- **Does not block UI:** Notification failure does not affect the user's prediction flow
- **Balance source:** Uses `data.new_balance` from the Supabase RPC response (actual server-side balance)

### 12.2. ProfileSettings.tsx — Test Message

```typescript
const { data, error } = await supabase.functions.invoke('telegram-webhook', {
  body: {
    event: 'test',
    chat_id: participant.telegram_chat_id,
    data: { balance: formattedBalance }
  }
});
```

**Key behaviors:**
- **Awaited:** Unlike prediction notifications, the test message IS awaited
- **Shows result to user:** Success → green "Test message sent!" toast; Failure → error message displayed
- **Balance source:** Fetched fresh from `wallets` table before sending

### 12.3. ProfileSettings.tsx — Pairing Link

```html
<a href={`https://t.me/WC2026_El_casino_bot?start=${participant.id}`}
   target="_blank" rel="noopener noreferrer">
  Pair Telegram Bot
</a>
```

### 12.4. ProfileSettings.tsx — Unlink

```typescript
await supabase.from('participants').update({
  telegram_chat_id: null,
  telegram_user: null,
}).eq('id', participant.id);
```

No notification is sent to Telegram on unlink.

---

## 13. Security Model

### Authentication Flow Per Trigger Source

| Source | Auth Method | Token Used |
|--------|-----------|------------|
| Frontend `supabase.functions.invoke()` | Supabase anon key (from client SDK) | Auto-attached by `@supabase/supabase-js` |
| DB trigger `net.http_post()` | Service role key from Vault | `Authorization: Bearer {service_role_key}` |
| Retry function `fetch()` | Bot token only (direct Telegram API) | In URL: `bot{TOKEN}/sendMessage` |

### Data Exposure Analysis

| Data | Visible to Frontend? | Visible in Telegram? |
|------|----------------------|---------------------|
| Bot Token | ❌ Never | ❌ Never |
| Service Role Key | ❌ Never | ❌ Never |
| `telegram_chat_id` | ✅ Stored in participant object in localStorage | ❌ Not shown in messages |
| Wallet balance | ✅ Yes (user's own) | ✅ Shown in notifications |
| Stake amounts | ✅ Yes | ✅ Shown in notifications |
| Other users' predictions | ❌ Not sent | ❌ Not sent |
| Match scores | ✅ Yes (public) | ✅ Shown in resolved notifications |

---

## 14. Error Handling — Complete Matrix

### Edge Function Errors (telegram-webhook)

| Error Condition | Code Location | Behavior |
|-----------------|---------------|----------|
| Missing `TELEGRAM_BOT_TOKEN` env var | Line 128-130 | Throws error → 500 response |
| Missing Supabase env vars | Line 132-134 | Throws error → 500 response |
| No `chat_id` in event payload | Line 146-151 | Returns `{ success: false }` with 200 |
| Telegram API returns non-OK status | `sendTelegramMessage()` line 44-47 | Returns `{ success: false, error: status + body }` |
| Telegram API fetch throws exception | `sendTelegramMessage()` line 50-53 | Returns `{ success: false, error: err.message }` |
| Failed to write to `notifications_log` | `logNotification()` line 104-106 | Logs to console, does not throw |
| Participant not found during pairing | Line 269-280 | Sends error message to user, returns 200 |
| Database update fails during pairing | Line 292-303 | Sends error message to user, returns 200 |
| Unknown event type (no matching `if`) | Line 225 | `text` remains empty, no message sent, returns 200 |

### Retry Function Errors

| Error Condition | Behavior |
|-----------------|----------|
| No failed notifications found | Returns `{ total: 0, message: "No failed notifications to retry." }` |
| No `chat_id` in payload | Skips entry, logs warning |
| Telegram API rejects retry | Increments `retry_count`, updates error message, status stays `FAILED` |
| `retry_count >= 3` | Entry is no longer queried (excluded by `lt('retry_count', 3)`) |
| `message_text` is null | Entry is excluded from query (`not('message_text', 'is', null)`) |

### Frontend Error Handling

All three prediction notification calls use `.catch()` which only logs to console:

```typescript
.catch(err => console.error("[App.tsx] Failed to trigger Telegram notification:", err));
```

The test message in ProfileSettings uses `try/catch` and shows the error in the UI.

---

## 15. Data Flow Diagrams — Per Event Type

### prediction_placed

```
User clicks "Confirm" in PredictionModal
    │
    ▼
App.tsx: handleSubmitPrediction()
    │
    ├─ 1. Optimistic UI update (immediate)
    │
    ├─ 2. supabase.rpc('place_prediction', {...})
    │      └─ RPC validates: deadline, balance, uniqueness
    │      └─ RPC deducts stake from wallet, inserts prediction
    │      └─ Returns: { success, new_balance, prediction_id }
    │
    ├─ 3. Update React Query cache with real prediction ID
    │
    ├─ 4. Show toast: "Prediction locked!"
    │
    └─ 5. IF currentUser.telegram_chat_id:
           supabase.functions.invoke('telegram-webhook', {
             event: 'prediction_placed', chat_id, data: {...}
           }).catch(...)
               │
               ▼
           telegram-webhook Edge Function
               │
               ├─ Renders message template
               ├─ fetch() → Telegram Bot API
               ├─ Logs to notifications_log
               └─ Returns { success: true }
```

### prediction_resolved (Database-Triggered)

```
sync-scores Edge Function polls football-data.org
    │
    ├─ Detects match status = FINISHED/FT
    ├─ Updates matches table: status, home_score, away_score, result
    │
    ▼
sync-scores calls resolve_match_predictions(match_id)
    │
    ├─ For each PENDING prediction:
    │   ├─ If prediction = result → status='WON', payout calculated
    │   └─ If prediction ≠ result → status='LOST', payout=0
    ├─ Updates wallet balances
    ├─ Creates transaction records
    │
    ▼
Sets matches.resolved = true
    │
    ▼
PostgreSQL trigger: on_match_resolved fires
    │
    ▼
notify_predictions_resolved() function
    │
    ├─ Retrieves service_role_key from vault.decrypted_secrets
    │
    ├─ For each settled prediction WHERE participant has telegram_chat_id:
    │   │
    │   └─ net.http_post(
    │        url: supabase_url + '/functions/v1/telegram-webhook',
    │        headers: { Authorization: 'Bearer ' + service_key },
    │        body: { event: 'prediction_resolved', chat_id, data: {...} }
    │      )
    │         │
    │         ▼
    │     telegram-webhook Edge Function
    │         ├─ Determines WON vs LOST
    │         ├─ Renders appropriate message template
    │         ├─ fetch() → Telegram Bot API
    │         ├─ Logs to notifications_log
    │         └─ Returns { success: true }
    │
    └─ All notifications fire independently (loop, not batched)
```

---

## 16. Environment Variables & Secrets

### Edge Function Environment Variables

| Variable | Required By | Source | Description |
|----------|------------|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | telegram-webhook, retry-notifications | `supabase secrets set` | Telegram Bot API token |
| `SUPABASE_URL` | All Edge Functions | Auto-injected by Supabase | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All Edge Functions | Auto-injected by Supabase | Service role key for DB access |

### Vault Secrets (for DB Trigger)

| Vault Key Name | Used By | Description |
|----------------|---------|-------------|
| `service_role_key` | `notify_predictions_resolved()` trigger | Supabase service role key for authenticating `net.http_post()` calls to Edge Functions |

### Setup Commands

```bash
# Set the Telegram bot token
supabase secrets set TELEGRAM_BOT_TOKEN=your-bot-token-here

# Store service role key in Vault (run once in SQL editor)
SELECT vault.create_secret('your-service-role-key', 'service_role_key');
```

---

## 17. Known Limitations & Edge Cases

### 1. No Group Chat Notifications
The current system only sends **individual DM notifications** to paired participants. There is no group chat notification feature (e.g., posting standings to a shared group after each match).

### 2. No Deadline Reminder Notifications
The PRD specifies deadline reminders 1 hour before kickoff, but these are **NOT implemented**. The `notifications_log` table has a `type` field that could support `DEADLINE_REMINDER`, but no code creates these entries.

### 3. No Daily Digest
The PRD mentions an optional daily digest at 08:00 AM. This is **NOT implemented**.

### 4. Approximate Balance in Cancellation Notifications
`prediction_cancelled` uses `balance + Number(predObj.stake)` as the displayed balance (`App.tsx:394`), which is calculated client-side before the RPC response. The actual server-side balance after refund may differ slightly.

### 5. Fire-and-Forget from Frontend
Frontend notification calls don't `await` the result (except test messages). If the Edge Function fails:
- User sees no error
- Failed notification is logged in `notifications_log`
- Retry system may pick it up (if within 2-hour window and retry_count < 3)

### 6. Markdown v1 Escaping Limitations
The `escMd()` function only escapes `_*\`[`. Team names with other special characters (e.g., `Côte d'Ivoire`) may cause parsing issues in Telegram's Markdown parser.

### 7. Retry System Only Works for Logged Notifications
If the `logNotification()` call itself fails (e.g., database error), the notification won't be retried because there's no log entry for the retry system to find.

### 8. Single Chat ID per Participant
Each participant can only have one `telegram_chat_id`. Re-pairing overwrites the previous chat ID. There's no multi-device or multi-chat support.

### 9. No Notification for Unlink
When a user unlinks Telegram, no farewell/confirmation message is sent to the Telegram chat.

### 10. Trigger Idempotency
The `resolve_match_predictions` function is idempotent — if `matches.resolved` is already `true`, it returns early. However, the trigger `on_match_resolved` fires on any `UPDATE` to the matches table, not just resolution. It checks `OLD.resolved IS DISTINCT FROM NEW.resolved AND NEW.resolved = true` to prevent duplicate firings.

---

## 18. Quick Reference: Code Locations

### Core Files

| What | File | Lines |
|------|------|-------|
| Edge Function entry point | `supabase/functions/telegram-webhook/index.ts` | All (368 lines) |
| `sendTelegramMessage()` helper | Same file | 28-54 |
| `escMd()` Markdown escaper | Same file | 59-62 |
| `formatCoins()` number formatter | Same file | 65-78 |
| `logNotification()` DB logger | Same file | 83-110 |
| Event router (body.event check) | Same file | 140-237 |
| Bot command handler (/start) | Same file | 239-353 |
| Retry Edge Function | `supabase/functions/retry-notifications/index.ts` | All (114 lines) |
| DB trigger function | `supabase/migrations/20260525_add_prediction_resolved_trigger.sql` | 17-91 |
| DB trigger definition | Same file | 94-99 |
| Resolution RPC (calls trigger) | `supabase/migrations/20260526_add_resolve_match_predictions.sql` | 18-128 |

### Frontend Files

| What | File | Lines |
|------|------|-------|
| `prediction_placed` notification | `src/App.tsx` | 274-293 |
| `prediction_updated` notification | `src/App.tsx` | 335-355 |
| `prediction_cancelled` notification | `src/App.tsx` | 392-408 |
| Test message sender | `src/components/ProfileSettings.tsx` | 298-334 |
| Pairing deep link | `src/components/ProfileSettings.tsx` | 605-612 |
| Unlink handler | `src/components/ProfileSettings.tsx` | 336-358 |
| Paired status UI | `src/components/ProfileSettings.tsx` | 550-614 |

### Database

| What | Table / Object | Key Columns |
|------|----------------|-------------|
| User pairing data | `participants` | `telegram_chat_id`, `telegram_user` |
| Notification log | `notifications_log` | `type`, `status`, `message_text`, `retry_count`, `error` |
| Match resolution trigger | `on_match_resolved` trigger on `matches` | Fires when `resolved` flips to `true` |
| Vault secret | `vault.decrypted_secrets` | `name = 'service_role_key'` |
