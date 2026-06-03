# Playmakers-Tracker-Bot

A Discord bot that posts daily capper performance recaps and sends unsettled bet reminders.

## Features

- **Daily Stats Posts** — Posts a performance summary for each active capper at 12:00 PM EST
  - Yesterday's units won
  - Last 7 days units won
  - Month-to-date units won
  - Year-to-date units won
  - Overall units won since joining
  - Team totals across all cappers

- **Unsettled Bet Reminders** — Pings each capper at 10:00 AM EST if they have pending bets from before today, with a "Done" button to dismiss

- **Stat Caching** — Stats are calculated fresh each run and cached in `capper_tracker_stats` (one row per capper, updated in place)

---

## Commands

| Command | Description |
|---|---|
| `/admin resendrecap` | Delete today's recap messages and send fresh ones |
| `/test` | Developer test command |

Admin commands are restricted to the user ID set in `ADMIN_OVERRIDE_ID`.

---

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` file with:
   ```
   DISCORD_TOKEN=your_bot_token
   APP_ID=your_app_id
   GUILD_ID=your_guild_id
   DATABASE_URL=postgres://user:pass@host/db
   RECAP_CHANNEL_ID=your_recap_channel_id
   ADMIN_OVERRIDE_ID=discord_user_id_for_admin_commands
   ```

3. Ensure the database is set up with:
   - `capper_info` table with `active`, `capper_name`, `emoji`, and `tracker_channel_id` columns
   - `capper_tracker_stats` table for cached stats (one row per capper)
   - `bets` table with `result` and `timestamp` columns

4. **Populate the tracker stats table** (run once on first deploy):
   ```bash
   node scripts/populate-tracker-stats.js
   ```

5. Deploy commands:
   ```bash
   node deploy-commands.js
   ```

6. Start the bot:
   ```bash
   npm start
   ```

---

## Scheduled Tasks

| Task | Schedule | Time |
|---|---|---|
| Unsettled bet reminder | `0 10 * * *` | 10:00 AM EST daily |
| Daily stats update | `0 12 * * *` | 12:00 PM EST daily |

To adjust, edit the cron expressions in `index.js`.

---

## Project Structure

```
commands/
  admin.js                  /admin resendrecap
  test.js                   Developer test command
interactions/
  unsettled-done.js         "Done" button handler for unsettled reminders
tasks/
  daily-stats-update.js     Builds and posts recap embeds per capper
  unsettled-bet-reminder.js Queries pending bets and sends reminder embeds
  stats-calculator.js       Core stat calculation logic
utils/
  db.js                     Postgres connection pool
scripts/                    One-off migration and debug scripts
```

---

## Database Queries

**Fetch active cappers:**
```sql
SELECT user_id, username, capper_name, emoji FROM capper_info WHERE active = 'yes'
```

**Fetch unsettled bets (placed before today midnight):**
```sql
SELECT DISTINCT cnr.user_id, cnr.username, cnr.tracker_channel_id, COUNT(b.id) as bet_count
FROM capper_info cnr
JOIN bets b ON cnr.user_id = b.user_id
WHERE cnr.active = 'yes' AND b.result = 'pending' AND CAST(b.timestamp AS BIGINT) < $1
GROUP BY cnr.user_id, cnr.username, cnr.tracker_channel_id
```

**Cache stats (upsert — one row per capper):**
```sql
INSERT INTO capper_tracker_stats (user_id, username, stats_date, units_won_yesterday, units_won_7days, units_won_month, units_won_ytd, units_won_overall)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (user_id) DO UPDATE SET ...
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `discord.js` v14 | Discord API client |
| `pg` | PostgreSQL client |
| `node-cron` | Cron-based task scheduling |
| `dotenv` | Environment variable loading |
