const db = require('../utils/db');

async function calculateCapperStats(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Local midnight
    const todayMs = today.getTime();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMs = yesterday.getTime();

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoMs = sevenDaysAgo.getTime();

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartMs = monthStart.getTime();

    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearStartMs = yearStart.getTime();

    try {
        // Fetch this capper's tracking start date — falls back to 0 (all history) if not set
        const { rows: capperRows } = await db.query(
            `SELECT tracking_start FROM capper_info WHERE user_id = $1`,
            [userId]
        );
        const trackingStartMs = capperRows[0]?.tracking_start
            ? new Date(capperRows[0].tracking_start).getTime()
            : 0;

        // Fetch all settled bets with date filtering in database
        const { rows } = await db.query(
            `SELECT 
                payout, risk, result, timestamp,
                CASE WHEN CAST(timestamp AS BIGINT) >= $2 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_yesterday,
                CASE WHEN CAST(timestamp AS BIGINT) >= $4 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_7days,
                CASE WHEN CAST(timestamp AS BIGINT) >= $5 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_month,
                CASE WHEN CAST(timestamp AS BIGINT) >= $6 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_ytd
             FROM bets 
             WHERE user_id = $1 AND result IN ('win', 'loss') AND COALESCE(is_live_play, 0) = 0
               AND CAST(timestamp AS BIGINT) >= $7
             ORDER BY timestamp DESC`,
            [userId, yesterdayMs, todayMs, sevenDaysAgoMs, monthStartMs, yearStartMs, trackingStartMs]
        );

        let unitsYesterday = 0;
        let units7Days = 0;
        let unitsMonth = 0;
        let unitsYTD = 0;
        let unitsTotal = 0;

        for (const bet of rows) {
            // For wins: use payout. For losses: use negative risk amount
            const units = bet.result === 'win' ? parseFloat(bet.payout) : -parseFloat(bet.risk);

            unitsTotal += units;
            
            if (bet.is_yesterday === 1) unitsYesterday += units;
            if (bet.is_7days === 1) units7Days += units;
            if (bet.is_month === 1) unitsMonth += units;
            if (bet.is_ytd === 1) unitsYTD += units;
        }

        return {
            units_won_yesterday: Number(unitsYesterday.toFixed(2)),
            units_won_7days: Number(units7Days.toFixed(2)),
            units_won_month: Number(unitsMonth.toFixed(2)),
            units_won_ytd: Number(unitsYTD.toFixed(2)),
            units_won_overall: Number(unitsTotal.toFixed(2))
        };
    } catch (err) {
        console.error(`Error calculating stats for user ${userId}:`, err);
        return null;
    }
}

// Live-play version of calculateCapperStats: swaps the "last 7 days" bucket for
// "last weekend" (most recent Saturday through now) since this only runs weekly.
// Periods are bounded by "now" rather than midnight so plays made earlier the
// morning of the recap (Sunday) still roll into weekend/month/ytd totals.
async function calculateLivePlayCapperStats(userId) {
    const now = new Date();
    const nowMs = now.getTime();

    const today = new Date(now);
    today.setHours(0, 0, 0, 0); // Local midnight
    const todayMs = today.getTime();

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMs = yesterday.getTime();

    // Most recent Saturday at midnight (Sat=6 -> 0 days back, Sun=0 -> 1 day back, ...)
    const weekendStart = new Date(today);
    const daysSinceSaturday = (today.getDay() + 1) % 7;
    weekendStart.setDate(weekendStart.getDate() - daysSinceSaturday);
    const weekendStartMs = weekendStart.getTime();

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthStartMs = monthStart.getTime();

    const yearStart = new Date(today.getFullYear(), 0, 1);
    const yearStartMs = yearStart.getTime();

    try {
        const { rows: capperRows } = await db.query(
            `SELECT tracking_start FROM capper_info WHERE user_id = $1`,
            [userId]
        );
        const trackingStartMs = capperRows[0]?.tracking_start
            ? new Date(capperRows[0].tracking_start).getTime()
            : 0;

        const { rows } = await db.query(
            `SELECT 
                payout, risk, result, timestamp,
                CASE WHEN CAST(timestamp AS BIGINT) >= $2 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_yesterday,
                CASE WHEN CAST(timestamp AS BIGINT) >= $4 AND CAST(timestamp AS BIGINT) <= $5 THEN 1 ELSE 0 END as is_weekend,
                CASE WHEN CAST(timestamp AS BIGINT) >= $6 AND CAST(timestamp AS BIGINT) <= $5 THEN 1 ELSE 0 END as is_month,
                CASE WHEN CAST(timestamp AS BIGINT) >= $7 AND CAST(timestamp AS BIGINT) <= $5 THEN 1 ELSE 0 END as is_ytd
             FROM bets 
             WHERE user_id = $1 AND result IN ('win', 'loss') AND is_live_play = 1
               AND CAST(timestamp AS BIGINT) >= $8
             ORDER BY timestamp DESC`,
            [userId, yesterdayMs, todayMs, weekendStartMs, nowMs, monthStartMs, yearStartMs, trackingStartMs]
        );

        let unitsYesterday = 0;
        let unitsWeekend = 0;
        let unitsMonth = 0;
        let unitsYTD = 0;
        let unitsTotal = 0;

        for (const bet of rows) {
            const units = bet.result === 'win' ? parseFloat(bet.payout) : -parseFloat(bet.risk);

            unitsTotal += units;

            if (bet.is_yesterday === 1) unitsYesterday += units;
            if (bet.is_weekend === 1) unitsWeekend += units;
            if (bet.is_month === 1) unitsMonth += units;
            if (bet.is_ytd === 1) unitsYTD += units;
        }

        return {
            units_won_yesterday: Number(unitsYesterday.toFixed(2)),
            units_won_weekend: Number(unitsWeekend.toFixed(2)),
            units_won_month: Number(unitsMonth.toFixed(2)),
            units_won_ytd: Number(unitsYTD.toFixed(2)),
            units_won_overall: Number(unitsTotal.toFixed(2))
        };
    } catch (err) {
        console.error(`Error calculating live play stats for user ${userId}:`, err);
        return null;
    }
}

module.exports = { calculateCapperStats, calculateLivePlayCapperStats };
