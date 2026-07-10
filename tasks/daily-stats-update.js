const db = require('../utils/db');
const { EmbedBuilder } = require('discord.js');
const { calculateCapperStats } = require('./stats-calculator');

async function dailyStatsUpdate(client) {
    console.log('🔄 Running daily stats update...');

    const recapChannelId = process.env.RECAP_CHANNEL_ID;
    if (!recapChannelId) {
        console.error('❌ RECAP_CHANNEL_ID not set in environment variables');
        return;
    }

    try {
        // Fetch recap channel
        const recapChannel = await client.channels.fetch(recapChannelId).catch(() => null);
        if (!recapChannel) {
            console.error(`❌ Could not fetch recap channel ${recapChannelId}`);
            return;
        }

        // Fetch all active cappers
        const { rows: cappers } = await db.query(
            `SELECT user_id, username, capper_name, emoji FROM capper_info 
             WHERE active = 'yes'`
        );

        const today = new Date().toISOString().split('T')[0];

        // Initialize team totals
        const teamTotals = {
            yesterday: 0,
            sevenDays: 0,
            month: 0,
            ytd: 0,
            overall: 0
        };

        for (const capper of cappers) {
            const { user_id, username, capper_name, emoji } = capper;

            // Calculate fresh stats
            const stats = await calculateCapperStats(user_id);
            if (!stats) continue;

            console.log(`${capper_name}: Yesterday=${stats.units_won_yesterday}, YTD=${stats.units_won_ytd}, Overall=${stats.units_won_overall}`);

            // Add to team totals
            teamTotals.yesterday += stats.units_won_yesterday;
            teamTotals.sevenDays += stats.units_won_7days;
            teamTotals.month += stats.units_won_month;
            teamTotals.ytd += stats.units_won_ytd;
            teamTotals.overall += stats.units_won_overall;

            // Cache stats in DB - updates latest record for this capper
            await db.query(
                `INSERT INTO capper_tracker_stats 
                (user_id, username, stats_date, units_won_yesterday, units_won_7days, units_won_month, units_won_ytd, units_won_overall)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (user_id) 
                DO UPDATE SET 
                    username = $2,
                    stats_date = $3,
                    units_won_yesterday = $4,
                    units_won_7days = $5,
                    units_won_month = $6,
                    units_won_ytd = $7,
                    units_won_overall = $8`,
                [user_id, username, today, stats.units_won_yesterday, stats.units_won_7days, stats.units_won_month, stats.units_won_ytd, stats.units_won_overall]
            );

            // Build embed with left-aligned list format
            const currentYear = new Date().getFullYear();
            const statsText = [
                `Yesterday:     ${stats.units_won_yesterday}u`,
                `Last 7 Days:   ${stats.units_won_7days}u`,
                `This Month:    ${stats.units_won_month}u`,
                `Year to Date:  ${stats.units_won_ytd}u`,
                ...(currentYear >= 2027 ? [`Overall: ${stats.units_won_overall}u`] : [])
            ].join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${emoji || '📊'} ${capper_name}'s Daily Stats`)
                .setColor(0x3498db)
                .setDescription(statsText)
                .setTimestamp();

            // Send to recap channel
            try {
                await recapChannel.send({ embeds: [embed] });
            } catch (err) {
                console.error(`Failed to send stats embed for ${capper_name}:`, err);
            }
        }

        // Send team recap with aggregated stats
        // Wait 3 seconds so Discord doesn't group it with individual recaps
        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentYear = new Date().getFullYear();
        const teamStatsText = [
            `Yesterday:     ${teamTotals.yesterday > 0 ? '+' : ''}${teamTotals.yesterday.toFixed(2)}u`,
            `Last 7 Days:   ${teamTotals.sevenDays > 0 ? '+' : ''}${teamTotals.sevenDays.toFixed(2)}u`,
            `This Month:    ${teamTotals.month > 0 ? '+' : ''}${teamTotals.month.toFixed(2)}u`,
            `Year to Date:  ${teamTotals.ytd > 0 ? '+' : ''}${teamTotals.ytd.toFixed(2)}u`,
            ...(currentYear >= 2027 ? [`Overall:       ${teamTotals.overall > 0 ? '+' : ''}${teamTotals.overall.toFixed(2)}u`] : [])
        ].join('\n');

        const teamEmbed = new EmbedBuilder()
            .setTitle('Team Recap')
            .setColor(0x2ECC71)
            .setDescription(teamStatsText)
            .setTimestamp();

        try {
            await recapChannel.send({ embeds: [teamEmbed] });
            console.log('📊 Team recap sent');
        } catch (err) {
            console.error('Failed to send team recap:', err);
        }

        console.log('✅ Daily stats update complete');
    } catch (err) {
        console.error('Error in dailyStatsUpdate:', err);
    }
}

module.exports = { dailyStatsUpdate };
