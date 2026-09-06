# Decisions Log

## 2026-09-05 — Live play tracking (daily-stats-update split + weekly recap)

**Context:** Added live-play tracking as a parallel track to regular capper stats. Needed a way to store weekly live-play stats without conflicting with the existing daily stats cache.

**Decision:** Migrated `capper_tracker_stats`'s unique constraint from `user_id` to `username` (`scripts/migrate-tracker-stats-key.js`, must be run manually by the user before deploy — no automated DB access available in this environment). Live-play rows are stored as `${username}_live_plays`, sharing the same `user_id` as the capper's regular row.

**Reasoning:** Task required two rows per live-play capper (regular + live) sharing `user_id`, which is incompatible with a unique constraint on `user_id` alone. `username` is already effectively unique per row (including the `_live_plays` suffix), so switching the conflict target was the minimal change. Alternative considered: composite key `(user_id, is_live_play)` — rejected because it would require adding a new column purely for upsert targeting, more invasive than reusing username.

**Consequence:** `units_won_7days` on a `_live_plays` row means "last weekend", not "last 7 days" — schema field is reused/relabeled only in the live-play recap embed, not renamed in the DB.

**Design choice — live-play period cutoffs use "now" instead of midnight:** Regular daily stats exclude "today" from all rolling windows (yesterday/7day/month/ytd) since a daily job catches up tomorrow. The live-play recap only runs weekly, so excluding "today" (Sunday) would leave Sunday's plays missing from month/YTD totals for a full week. Windows for weekend/month/ytd use `<= now` as the upper bound instead of `< midnight`, so today's plays are counted immediately. "Yesterday" (Saturday) still uses a fixed midnight-to-midnight window since it's a single completed calendar day.

**Not changed (flagged, not implemented):** `tasks/unsettled-bet-reminder.js` was not filtered to exclude `is_live_play = 1` bets. This means a capper with a pending live-play bet could get pinged by both the regular (daily 10am) and live (Sunday 9am) reminders. Only explicitly requested for `daily-stats-update.js` (Task 2), so left as-is pending user confirmation.
