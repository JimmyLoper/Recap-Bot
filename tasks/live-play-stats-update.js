const db = require('../utils/db');
const { EmbedBuilder } = require('discord.js');
const { calculateLivePlayCapperStats } = require('./stats-calculator');

async function livePlayStatsUpdate(client) {
    console.log('🔄 Running live play stats update...');

    const recapChannelId = process.env.LIVE_PLAY_RECAP_CHANNEL_ID;
    if (!recapChannelId) {
        console.error('❌ LIVE_PLAY_RECAP_CHANNEL_ID not set in environment variables');
        return;
    }

    try {
        const recapChannel = await client.channels.fetch(recapChannelId).catch(() => null);
        if (!recapChannel) {
            console.error(`❌ Could not fetch recap channel ${recapChannelId}`);
            return;
        }

        const { rows: cappers } = await db.query(
            `SELECT user_id, username, capper_name, emoji FROM capper_info 
             WHERE active = 'yes' AND live_play_tracking = 'yes'`
        );

        const today = new Date().toISOString().split('T')[0];

        const teamTotals = {
            yesterday: 0,
            weekend: 0,
            month: 0,
            ytd: 0,
            overall: 0
        };

        for (const capper of cappers) {
            const { user_id, username, capper_name, emoji } = capper;

            const stats = await calculateLivePlayCapperStats(user_id);
            if (!stats) continue;

            console.log(`${capper_name} (live): Yesterday=${stats.units_won_yesterday}, Weekend=${stats.units_won_weekend}, YTD=${stats.units_won_ytd}`);

            teamTotals.yesterday += stats.units_won_yesterday;
            teamTotals.weekend += stats.units_won_weekend;
            teamTotals.month += stats.units_won_month;
            teamTotals.ytd += stats.units_won_ytd;
            teamTotals.overall += stats.units_won_overall;

            // Stored under a distinct username (suffixed) so live-play stats
            // don't overwrite the capper's regular capper_tracker_stats row.
            // units_won_7days holds "last weekend" here to keep the schema shared.
            const liveUsername = `${username}_live_plays`;
            await db.query(
                `INSERT INTO capper_tracker_stats 
                (user_id, username, stats_date, units_won_yesterday, units_won_7days, units_won_month, units_won_ytd, units_won_overall)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (username) 
                DO UPDATE SET 
                    user_id = $1,
                    stats_date = $3,
                    units_won_yesterday = $4,
                    units_won_7days = $5,
                    units_won_month = $6,
                    units_won_ytd = $7,
                    units_won_overall = $8`,
                [user_id, liveUsername, today, stats.units_won_yesterday, stats.units_won_weekend, stats.units_won_month, stats.units_won_ytd, stats.units_won_overall]
            );

            const currentYear = new Date().getFullYear();
            const statsText = [
                `Yesterday:     ${stats.units_won_yesterday}u`,
                `Last Weekend:  ${stats.units_won_weekend}u`,
                `This Month:    ${stats.units_won_month}u`,
                `Year to Date:  ${stats.units_won_ytd}u`,
                ...(currentYear >= 2027 ? [`Overall: ${stats.units_won_overall}u`] : [])
            ].join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${emoji || '📊'} ${capper_name}'s Live Play Recap`)
                .setColor(0x3498db)
                .setDescription(statsText)
                .setTimestamp();

            try {
                await recapChannel.send({ embeds: [embed] });
            } catch (err) {
                console.error(`Failed to send live play stats embed for ${capper_name}:`, err);
            }
        }

        // Wait 3 seconds so Discord doesn't group it with individual recaps
        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentYear = new Date().getFullYear();
        const teamStatsText = [
            `Yesterday:     ${teamTotals.yesterday > 0 ? '+' : ''}${teamTotals.yesterday.toFixed(2)}u`,
            `Last Weekend:  ${teamTotals.weekend > 0 ? '+' : ''}${teamTotals.weekend.toFixed(2)}u`,
            `This Month:    ${teamTotals.month > 0 ? '+' : ''}${teamTotals.month.toFixed(2)}u`,
            `Year to Date:  ${teamTotals.ytd > 0 ? '+' : ''}${teamTotals.ytd.toFixed(2)}u`,
            ...(currentYear >= 2027 ? [`Overall:       ${teamTotals.overall > 0 ? '+' : ''}${teamTotals.overall.toFixed(2)}u`] : [])
        ].join('\n');

        const teamEmbed = new EmbedBuilder()
            .setTitle('Live Play Team Recap')
            .setColor(0x2ECC71)
            .setDescription(teamStatsText)
            .setTimestamp();

        try {
            await recapChannel.send({ embeds: [teamEmbed] });
            console.log('📊 Live play team recap sent');
        } catch (err) {
            console.error('Failed to send live play team recap:', err);
        }

        console.log('✅ Live play stats update complete');
    } catch (err) {
        console.error('Error in livePlayStatsUpdate:', err);
    }
}

module.exports = { livePlayStatsUpdate };
