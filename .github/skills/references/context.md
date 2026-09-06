# Recap-Bot — Project Context

## Purpose
Discord bot posting capper performance recaps and unsettled-bet reminders, backed by Postgres (`utils/db.js`, pooled via `pg`).

## Core tables
- `capper_info` — one row per capper. Columns of note: `user_id` (PK-ish, Discord ID), `username`, `capper_name`, `emoji`, `active` ('yes'/'no' string), `tracker_channel_id`, `token`, `tracking_start` (DATE, per-capper stats start), `live_play_tracking` ('yes'/'no' string).
- `bets` — one row per bet. Columns of note: `user_id`, `result` ('win'/'loss'/'pending'), `payout`, `risk`, `timestamp` (stored as string, cast to BIGINT epoch ms in queries), `is_live_play` (0/1 — confirmed legacy rows default to `0`, not NULL, so plain `is_live_play = 0` comparisons are safe without `COALESCE`).
- `capper_tracker_stats` — cached stats snapshot, one row per (capper, track). Columns: `user_id`, `username`, `stats_date`, `units_won_yesterday`, `units_won_7days`, `units_won_month`, `units_won_ytd`, `units_won_overall`.
  - **Unique key is `username`** (migrated from `user_id` — see decisions.md). Live-play rows reuse the same `user_id` as the capper's regular row but store under `${username}_live_plays`, so `units_won_7days` on that row means "last weekend" for live-play recaps, not "last 7 days".

## Task layout
- `tasks/stats-calculator.js` — `calculateCapperStats(userId)` (regular, excludes live plays) and `calculateLivePlayCapperStats(userId)` (live-play only, weekly cadence).
- `tasks/daily-stats-update.js` — daily recap embed per active capper + team total, posted to `RECAP_CHANNEL_ID`, cron `0 12 * * *`.
- `tasks/live-play-stats-update.js` — weekly (Sunday) live-play recap for cappers with `live_play_tracking = 'yes'`, posted to `LIVE_PLAY_RECAP_CHANNEL_ID`, cron `0 10 * * 0`.
- `tasks/unsettled-bet-reminder.js` — daily pending-bet reminder (all bets), cron `0 10 * * *`.
- `tasks/unsettled-live-bet-reminder.js` — weekly pending-live-bet reminder (is_live_play=1 only), cron `0 9 * * 0` (1 hour before live recap).
- `interactions/dismiss_settle_reminder.js` — shared "Done" button handler for both reminder flows (matches by customId prefix, no live-specific variant needed).

## Required env vars
`DISCORD_TOKEN`, `APP_ID`, `GUILD_ID`, `DATABASE_URL`, `RECAP_CHANNEL_ID`, `LIVE_PLAY_RECAP_CHANNEL_ID`, `ADMIN_OVERRIDE_ID`, `WEB_URL`.

## One-off scripts (run manually, never on deploy automatically)
`scripts/` holds migration/debug/report scripts invoked with `node scripts/<name>.js`. `db-migrate.js` runs arbitrary SQL passed as `argv[2]`. DB is only reachable from within the deployed (Railway) network — cannot be queried from a local dev machine.
