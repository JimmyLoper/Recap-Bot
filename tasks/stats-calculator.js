const db = require('../utils/db');

async function calculateCapperStats(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Local midnight
    const todayMs = today.getTime();

    console.log(`[TIMEZONE DEBUG] Today: ${today.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST | ${today.toISOString()} UTC | ${todayMs}ms`);

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
        // Fetch all settled bets with date filtering in database
        const { rows } = await db.query(
            `SELECT 
                payout, risk, result, timestamp,
                CASE WHEN CAST(timestamp AS BIGINT) >= $2 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_yesterday,
                CASE WHEN CAST(timestamp AS BIGINT) >= $4 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_7days,
                CASE WHEN CAST(timestamp AS BIGINT) >= $5 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_month,
                CASE WHEN CAST(timestamp AS BIGINT) >= $6 AND CAST(timestamp AS BIGINT) < $3 THEN 1 ELSE 0 END as is_ytd
             FROM bets 
             WHERE user_id = $1 AND result IN ('win', 'loss')
             ORDER BY timestamp DESC`,
            [userId, yesterdayMs, todayMs, sevenDaysAgoMs, monthStartMs, yearStartMs]
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

module.exports = { calculateCapperStats };
