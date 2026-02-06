# Playmakers-Tracker-Bot

A Discord bot that automatically posts daily capper performance statistics and sends unsettled bet reminders.

## Features

- **Daily Stats Posts**: Posts performance summaries for each active capper at 9:00 AM UTC
  - Yesterday's units won
  - Last 7 days units won
  - Month-to-date units won
  - Year-to-date units won
  - Overall units won since joining

- **Unsettled Bet Reminders**: Sends reminders every 6 hours for cappers with pending bets

- **Efficient Calculations**: Caches stats in database to minimize computation

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
   ```

3. Ensure database is set up with:
   - `capper_info` table with `active` column (yes/no)
   - `capper_tracker_stats` table for latest stats tracking
   - `bets` table with `result` and `timestamp` columns

4. **Populate the tracker stats table** (run this once):
   ```bash
   node scripts/populate-tracker-stats.js
   ```
   This initializes the table with all active cappers from `capper_info`.

5. Deploy the test command:
   ```bash
   node deploy-commands.js
   ```

6. Start the bot:
   ```bash
   npm start
   ```

## Scheduled Tasks

- **Daily Stats Update**: 9:00 AM UTC (cron: `0 9 * * *`)
- **Unsettled Bet Reminder**: Every 6 hours (cron: `0 */6 * * *`)

## Cron Schedule Adjustment

To change schedules, edit the cron expressions in `index.js`:

```javascript
cron.schedule('0 9 * * *', () => { ... });  // Change the first expression
```

Common patterns:
- `0 9 * * *` - Daily at 9:00 AM UTC
- `0 */6 * * *` - Every 6 hours
- `0 */4 * * *` - Every 4 hours
- `0 9,21 * * *` - Twice daily (9am and 9pm UTC)

## Database Queries

The bot uses these queries:

**Fetch active cappers:**
```sql
SELECT user_id, username, tracker_channel_id FROM capper_info WHERE active = 'yes'
```

**Fetch unsettled bets:**
```sql
SELECT DISTINCT cnr.user_id, cnr.username, cnr.tracker_channel_id, COUNT(b.id) as bet_count
FROM capper_info cnr
JOIN bets b ON cnr.user_id = b.user_id
WHERE cnr.active = 'yes' AND b.result = 'pending'
GROUP BY cnr.user_id, cnr.username, cnr.tracker_channel_id
```

**Cache stats:**
```sql
INSERT INTO capper_tracker_stats (user_id, username, stats_date, units_won_yesterday, units_won_7days, units_won_month, units_won_ytd, units_won_total)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (user_id, stats_date) DO UPDATE SET ...
```
