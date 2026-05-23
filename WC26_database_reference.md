# WC 2026 — Database Reference

## Overview
This database supports a highly interactive, real-time sports prediction and wallet-staking platform for the FIFA World Cup 2026. The system enables participants to register, manage virtual wallets populated with virtual coins, place predictions on tournament matches with custom coin stakes, view past outcome histories, and see real-time updates and leaderboard changes synchronized with live score events.

The database consists of **7 primary tables** in the `public` schema:
- **`participants`**: Profile registry of active tournament users.
- **`wallets`**: Financial ledger holding user coin balances and in-play allocations.
- **`matches`**: Full fixtures ledger detailing team, codes, status, timing, and scorelines.
- **`predictions`**: Record of user-staked predictions on match outcomes.
- **`transactions`**: Ledger tracking financial updates (initial, stake, update, payout, refund).
- **`leaderboard_snapshots`**: Periodic snapshots tracking tournament rankings after matches.
- **`notifications_log`**: Log to monitor notifications and match alerts.

---

## Entity Relationship Summary

The entities follow a classic financial staking domain pattern:
1. A **Participant** (`participants`) represents a user.
2. Every **Participant** has exactly one associated **Wallet** (`wallets`) containing their balance.
3. **Matches** (`matches`) hold details of World Cup games.
4. A **Participant** can place one staked **Prediction** (`predictions`) per **Match**.
5. Making a prediction locks the staked virtual coin amount in their **Wallet** and adds a matching transaction in `transactions`.
6. Resolving a match triggers a payouts calculation, updates wallet balances, and logs transaction updates.
7. **Leaderboard Snapshots** are generated to capture snapshot statistics at match milestones.

### ER Diagram

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

---

## Tables

### `participants`
- **Purpose:** Represents users registered in the tournament pool.
- **Columns:**

| Name | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Unique primary key identifying the participant. |
| `name` | `text` | NO | *None* | Unique system handle/name of the participant. |
| `display_name` | `text` | YES | *None* | Friendly display name. |
| `photo_url` | `text` | YES | *None* | Profile picture image URL (or path to local avatar asset). |
| `telegram_user` | `text` | YES | *None* | Telegram username handle if integrated with bot alerts. |
| `is_active` | `boolean` | YES | `true` | Indicates if the user account is active. |
| `created_at` | `timestamp with time zone` | YES | `now()` | Timestamp of profile registration. |
| `pin` | `text` | YES | *None* | Hashed/plain pass-pin for login verification. |

- **Primary Key:** `id`
- **Foreign Keys:** *None*
- **Indexes:** 
  - `participants_pkey` ON `id` (Unique B-tree)
- **Constraints:**
  - `2200_17590_1_not_null`: `id` must not be null
  - `2200_17590_2_not_null`: `name` must not be null
- **RLS Policies:**
  - `Public access` (`ALL`): Permissive access allowing all roles (`public`) full CRUD.
- **Triggers:**
  - `on_participant_created` (`AFTER INSERT`): Fires `EXECUTE FUNCTION create_wallet_for_new_participant()` to automatically initialize a wallet and starting coin balance.

---

### `wallets`
- **Purpose:** Tracks coin balances (liquid balance and amount locked in active predictions) for each participant.
- **Columns:**

| Name | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Unique primary key identifying the wallet. |
| `participant_id` | `uuid` | NO | *None* | References the associated participant. |
| `balance` | `numeric` | NO | `1000000` | Current available liquid coin balance (default 1,000,000). |
| `in_play` | `numeric` | NO | `0` | Sum of coin stakes locked in active pending predictions. |
| `updated_at` | `timestamp with time zone` | NO | `now()` | Timestamp of the last balance modification. |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `participant_id` references `participants(id)`
- **Indexes:**
  - `wallets_pkey` ON `id` (Unique B-tree)
  - `wallets_participant_id_key` ON `participant_id` (Unique B-tree)
- **Constraints:**
  - `wallets_participant_id_key`: Unique constraint on `participant_id` (1-to-1 relationship)
  - Not Null checks: `id`, `participant_id`, `balance`, `in_play`, `updated_at` must not be null.
- **RLS Policies:**
  - `Enable read access for all users` (`SELECT`): Read access allowed to all public roles.
- **Triggers:** *None*

---

### `matches`
- **Purpose:** Represents scheduled FIFA World Cup matches, live scores, status, and prediction lock windows.
- **Columns:**

| Name | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Unique primary key identifying the match. |
| `api_match_id` | `text` | YES | *None* | Unique match identifier synced from the external football API. |
| `home_team` | `text` | NO | *None* | Name of the home nation/team. |
| `away_team` | `text` | NO | *None* | Name of the away nation/team. |
| `home_team_code` | `text` | YES | *None* | 3-letter FIFA code of the home team (e.g. `MEX`). |
| `away_team_code` | `text` | YES | *None* | 3-letter FIFA code of the away team (e.g. `RSA`). |
| `home_logo_url` | `text` | YES | *None* | URL of the home team crest/flag. |
| `away_logo_url` | `text` | YES | *None* | URL of the away team crest/flag. |
| `kickoff_utc` | `timestamp with time zone` | NO | *None* | Scheduled date and time of the match kickoff. |
| `stage` | `text` | NO | *None* | Tournament round/stage (e.g. `GROUP`, `R32`, `SF`, `FINAL`). |
| `group_name` | `text` | YES | *None* | Associated group letter if a group stage match (e.g. `A`). |
| `status` | `text` | NO | `'NS'` | Match status code: `NS` (Not Started), `LIVE`, `HT` (Half Time), `FT` (Full Time), `AET` (Extra Time), `PEN` (Penalties). |
| `home_score` | `integer` | YES | *None* | Active/final score of the home team. |
| `away_score` | `integer` | YES | *None* | Active/final score of the away team. |
| `result` | `text` | YES | *None* | Determined final outcome (e.g., `'HOME_WIN'`, `'AWAY_WIN'`, `'DRAW'`, `'HOME_ADVANCE'`, etc.). |
| `resolved` | `boolean` | NO | `false` | Indicates if prediction payouts have been processed for this match. |
| `prediction_close` | `timestamp with time zone` | NO | *None* | Exact timestamp when stakes and predictions lock (normally 1 hour before kickoff). |
| `created_at` | `timestamp with time zone` | NO | `now()` | Record creation timestamp. |
| `updated_at` | `timestamp with time zone` | NO | `now()` | Last details update timestamp. |

- **Primary Key:** `id`
- **Foreign Keys:** *None*
- **Indexes:**
  - `matches_pkey` ON `id` (Unique B-tree)
  - `matches_api_match_id_key` ON `api_match_id` (Unique B-tree)
- **Constraints:**
  - `matches_api_match_id_key`: Unique constraint on `api_match_id`
  - Not Null checks on: `id`, `home_team`, `away_team`, `kickoff_utc`, `stage`, `status`, `resolved`, `prediction_close`, `created_at`, `updated_at`.
- **RLS Policies:**
  - `Enable read access for all users` (`SELECT`): Read access allowed to all public roles.
- **Triggers:** *None*

---

### `predictions`
- **Purpose:** Holds prediction stakes made by participants on matches.
- **Columns:**

| Name | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Unique primary key identifying the prediction. |
| `participant_id` | `uuid` | NO | *None* | References the predicting participant. |
| `match_id` | `uuid` | NO | *None* | References the predicted match. |
| `prediction` | `text` | NO | *None* | Choice option selected (e.g. `'HOME_WIN'`, `'AWAY_WIN'`, `'DRAW'`, `'HOME_ADVANCE'`). |
| `stake` | `numeric` | NO | *None* | Number of virtual coins staked on this prediction. |
| `status` | `text` | NO | `'PENDING'` | Staking status: `'PENDING'`, `'WON'`, `'LOST'`, or `'REFUNDED'`. |
| `payout` | `numeric` | YES | *None* | Coins returned on win resolution (stake + net profit). |
| `submitted_at` | `timestamp with time zone` | NO | `now()` | Timestamp when the prediction was placed. |
| `updated_at` | `timestamp with time zone` | NO | `now()` | Last modification timestamp. |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `participant_id` references `participants(id)`
  - `match_id` references `matches(id)`
- **Indexes:**
  - `predictions_pkey` ON `id` (Unique B-tree)
  - `predictions_participant_id_match_id_key` ON `(participant_id, match_id)` (Unique B-tree)
- **Constraints:**
  - `predictions_participant_id_match_id_key`: Unique constraint. A participant is limited to **exactly one active prediction** per match.
  - Not Null checks on: `id`, `participant_id`, `match_id`, `prediction`, `stake`, `status`, `submitted_at`, `updated_at`.
- **RLS Policies:**
  - `Enable read access for all users` (`SELECT`): Read access allowed to all public roles.
- **Triggers:** *None*

---

### `transactions`
- **Purpose:** Audit ledger documenting every balance change (credits, debits, adjustments) for participant wallets.
- **Columns:**

| Name | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Unique primary key identifying the transaction. |
| `participant_id` | `uuid` | NO | *None* | References the associated participant. |
| `match_id` | `uuid` | YES | *None* | References the match related to the transaction (if any). |
| `prediction_id` | `uuid` | YES | *None* | References the prediction associated with the stake (set to null if prediction cancelled). |
| `type` | `text` | NO | *None* | Event category: `'INITIAL_BALANCE'`, `'STAKE'`, `'UPDATE_STAKE'`, `'PAYOUT'`, `'REFUND'`, `'ADJUSTMENT'`. |
| `amount` | `numeric` | NO | *None* | Value of the transaction (negative for stakes/debits, positive for credits/refunds). |
| `balance_after` | `numeric` | NO | *None* | Net balance in the wallet immediately after applying this transaction. |
| `note` | `text` | YES | *None* | Explanatory description. |
| `created_at` | `timestamp with time zone` | NO | `now()` | Timestamp of transaction entry. |

- **Primary Key:** `id`
- **Foreign Keys:**
  - `participant_id` references `participants(id)`
  - `match_id` references `matches(id)`
  - `prediction_id` references `predictions(id)` on delete set null
- **Indexes:**
  - `transactions_pkey` ON `id` (Unique B-tree)
- **Constraints:**
  - Not Null checks on: `id`, `participant_id`, `type`, `amount`, `balance_after`, `created_at`.
- **RLS Policies:**
  - `Enable read access for all users` (`SELECT`): Read access allowed to all public roles.
- **Triggers:** *None*

---

### `leaderboard_snapshots`
- **Purpose:** Snapshot logs tracking rankings and wallets state following match resolutions to present point histories and leaderboards.
- **Columns:**

| Name | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Unique primary key identifying the snapshot. |
| `match_id` | `uuid` | NO | *None* | References the match that triggered the snapshot updates. |
| `snapshot` | `jsonb` | NO | *None* | Full JSON structure preserving rank, name, balance, and delta for all active participants. |
| `created_at` | `timestamp with time zone` | YES | `now()` | Time the snapshot was archived. |

- **Primary Key:** `id`
- **Foreign Keys:** *None*
- **Indexes:**
  - `leaderboard_snapshots_pkey` ON `id` (Unique B-tree)
- **Constraints:**
  - Not Null checks on: `id`, `match_id`, `snapshot`.
- **RLS Policies:**
  - `Public access` (`ALL`): Full read, write, update, delete enabled to all public roles.
- **Triggers:** *None*

---

### `notifications_log`
- **Purpose:** Event tracking log logging background sync operations, match notifications, or bot reminders.
- **Columns:**

| Name | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | Unique primary key identifying the notification. |
| `type` | `text` | NO | *None* | The category of notification (e.g. `'MATCH_START'`, `'MATCH_RESULT'`, `'REMINDER'`). |
| `match_id` | `uuid` | YES | *None* | References the associated match. |
| `payload` | `jsonb` | YES | *None* | Full payload body/metadata details. |
| `sent_at` | `timestamp with time zone` | YES | *None* | exact time sent. |
| `status` | `text` | YES | `'PENDING'` | Processing status: `'PENDING'`, `'SENT'`, `'FAILED'`. |
| `error` | `text` | YES | *None* | Captured error output if sending failed. |

- **Primary Key:** `id`
- **Foreign Keys:** *None*
- **Indexes:**
  - `notifications_log_pkey` ON `id` (Unique B-tree)
- **Constraints:**
  - Not Null checks on: `id`, `type`.
- **RLS Policies:**
  - `Public access` (`ALL`): Full CRUD permissions enabled to all public roles.
- **Triggers:** *None*

---

## Enums & Custom Types

No custom PostgreSQL enum types (`pg_enum`) are defined in the public schema. Domain states and options are handled via strict application-level logic and standard text check validation:
* **Match Status (`matches.status`):** `'NS'` (Not Started), `'LIVE'`, `'HT'` (Half Time), `'FT'` (Full Time), `'AET'` (After Extra Time), `'PEN'` (Penalties).
* **Prediction Option (`predictions.prediction`):** `'HOME_WIN'`, `'AWAY_WIN'`, `'DRAW'`, `'HOME_ADVANCE'`, `'AWAY_ADVANCE'`.
* **Prediction Status (`predictions.status`):** `'PENDING'`, `'WON'`, `'LOST'`, `'REFUNDED'`.
* **Transaction Type (`transactions.type`):** `'INITIAL_BALANCE'`, `'STAKE'`, `'UPDATE_STAKE'`, `'PAYOUT'`, `'REFUND'`, `'ADJUSTMENT'`.

---

## Database Functions

### `calc_prediction_close`
- **Input Parameters:** `ts timestamp with time zone`
- **Return Type:** `timestamp with time zone`
- **Language/Source:** `SQL`
- **Description:** Small helper utility that determines the exact lock time of predictions for a match based on its kickoff time. It subtracts precisely 1 hour from the input timestamp.

```sql
SELECT ts - interval '1 hour';
```

---

### `create_wallet_for_new_participant`
- **Input Parameters:** *None*
- **Return Type:** `trigger`
- **Language/Source:** `PL/pgSQL`
- **Description:** Trigger handler function executed automatically whenever a new row is added to the `participants` table. It inserts a new matching wallet row with a starting virtual balance of `1,000,000` coins and logs a corresponding `'INITIAL_BALANCE'` entry in the transaction history.

```sql
BEGIN
  INSERT INTO public.wallets (participant_id, balance, in_play) VALUES (NEW.id, 1000000, 0);
  INSERT INTO public.transactions (participant_id, type, amount, balance_after, note) VALUES (NEW.id, 'INITIAL_BALANCE', 1000000, 1000000, 'Initial platform balance');
  RETURN NEW;
END;
```

---

### `place_prediction`
- **Input Parameters:** 
  - `p_participant_id uuid`
  - `p_match_id uuid`
  - `p_prediction text`
  - `p_stake numeric`
- **Return Type:** `jsonb`
- **Language/Source:** `PL/pgSQL`
- **Description:** High-integrity procedural transaction function to place a new prediction stake.
  1. Validates the existence of the match.
  2. Ensures the current system time has not exceeded the match `prediction_close` deadline.
  3. Checks if the participant already holds a prediction for this match (returns an error if true).
  4. Locks the participant's wallet record for update (`FOR UPDATE`) to prevent concurrent race conditions.
  5. Confirms that the wallet holds a liquid balance greater than or equal to the desired `p_stake` amount.
  6. Deducts the `p_stake` from the available balance and increments the `in_play` counter.
  7. Inserts the prediction record, adds a matching `'STAKE'` transaction, and returns a success JSON payload containing the new available balance.

---

### `cancel_prediction`
- **Input Parameters:** `p_prediction_id uuid`
- **Return Type:** `jsonb`
- **Language/Source:** `PL/pgSQL`
- **Description:** High-integrity procedural transaction function to cancel an active pending prediction.
  1. Locates and locks the target prediction record for update (`FOR UPDATE`).
  2. Verifies the target match exists and that the system time has not passed the prediction locking window (`prediction_close`).
  3. Confirms that the prediction is still in `'PENDING'` status.
  4. Locks the participant's wallet for update.
  5. Refunds the stake amount back into the liquid balance and decrements the `in_play` allocation.
  6. Disassociates the prediction from any existing transactions (sets their `prediction_id = NULL`) to avoid foreign key violations upon deletion.
  7. Inserts a new `'REFUND'` transaction.
  8. Deletes the prediction record.

---

### `update_prediction`
- **Input Parameters:**
  - `p_prediction_id uuid`
  - `p_new_prediction text`
  - `p_new_stake numeric`
- **Return Type:** `jsonb`
- **Language/Source:** `PL/pgSQL`
- **Description:** Transaction function allowing users to alter both their prediction choice and the staked amount while the lock window remains open.
  1. Locates and locks the target prediction record for update.
  2. Checks that predictions have not locked and that the status is still `'PENDING'`.
  3. Locks the participant's wallet.
  4. Calculates the difference (`p_new_stake - existing_stake`). If the new stake is higher, checks for sufficient liquid balance.
  5. Subtracts the difference from the liquid balance, adjusts the `in_play` index, and updates the prediction.
  6. Logs a `'UPDATE_STAKE'` transaction.

---

### `rls_auto_enable`
- **Input Parameters:** *None*
- **Return Type:** `event_trigger`
- **Language/Source:** `PL/pgSQL`
- **Description:** An event trigger handler function that automatically enforces Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) on any newly created tables in the `public` schema.

---

## Extensions

The following Postgres extensions are currently active in this database:

1. **`plpgsql`**: Built-in procedural language handler for executing PL/pgSQL database functions.
2. **`pgcrypto`**: Cryptographic functions used for cryptographic hashes and UUID generation (`gen_random_uuid()`).
3. **`uuid-ossp`**: Standard algorithms for generating universally unique identifiers.
4. **`pg_cron`**: Background job scheduling engine in PostgreSQL used to automate live updates, statistics snapshots, and cleanups.
5. **`pg_stat_statements`**: Tracking utility to monitor execution planning, query times, and database statistics.
6. **`supabase_vault`**: Safe credential storage for encryption keys and integration tokens.
7. **`pg_net`**: Asynchronous HTTP request executor used to call external Supabase Edge Functions directly from database triggers or cron jobs.

---

## Key Relationships Cheatsheet

| Source (Child Table + Column) | Target (Parent Table + Column) | Description / Cascade Action |
|---|---|---|
| `wallets.participant_id` | `participants.id` | Maps wallet ownership to participant. 1-to-1 relationship constraint. |
| `predictions.participant_id` | `participants.id` | Identifies which participant placed the prediction. |
| `predictions.match_id` | `matches.id` | Associates the prediction with the specific World Cup fixture. |
| `transactions.participant_id` | `participants.id` | Audits which wallet/participant is modified. |
| `transactions.match_id` | `matches.id` | Optional association link showing which game related to the adjustment. |
| `transactions.prediction_id` | `predictions.id` | References the prediction. Uses **`ON DELETE SET NULL`** to allow cancellation. |

---

## Notes for AI Assistants

When composing queries, migrations, or application code for this database, adhere to the following rules:

### 1. High Integrity Transactions
**NEVER** modify `wallets.balance`, `wallets.in_play`, or create entries in `predictions` directly from application code. You must always invoke the database transactional RPC functions:
- To create: `SELECT public.place_prediction(p_participant_id, p_match_id, p_prediction, p_stake)`
- To cancel: `SELECT public.cancel_prediction(p_prediction_id)`
- To update: `SELECT public.update_prediction(p_prediction_id, p_new_prediction, p_new_stake)`

These functions employ rigorous `FOR UPDATE` locking sequences to prevent concurrency balance exploits (double spends).

### 2. Time Window Locks
Stakes and predictions lock exactly 1 hour prior to kickoff (`matches.prediction_close`). Always verify that the current timestamp is less than `prediction_close` before allowing any UI-level predictions modifications.

### 3. Balance Staking Logic
The sum of `wallets.balance` and `wallets.in_play` must mathematically equal the total net sum of all transaction audit entries for that participant.
* Stakes deduct from `balance` and add to `in_play` (Transaction type `'STAKE'` / amount negative).
* Cancellations/Refunds add to `balance` and deduct from `in_play` (Transaction type `'REFUND'` / amount positive).
* Payouts add to `balance` and deduct the original stake from `in_play` (Transaction type `'PAYOUT'` / amount positive).
