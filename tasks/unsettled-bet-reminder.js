const db = require('../utils/db');
const { EmbedBuilder } = require('discord.js');

async function unsettledBetReminder(client) {
    console.log('🔔 Checking for unsettled bets...');

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

        // Fetch all active cappers with unsettled bets placed before today at 12am
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to midnight of today
        const todayTimestamp = today.getTime();

        const { rows: unsettledBets } = await db.query(
            `SELECT DISTINCT cnr.user_id, cnr.username, COUNT(b.id) as bet_count
             FROM capper_info cnr
             JOIN bets b ON cnr.user_id = b.user_id
             WHERE cnr.active = 'yes' AND b.result = 'pending' AND b.timestamp < $1
             GROUP BY cnr.user_id, cnr.username`,
            [todayTimestamp]
        );

        for (const row of unsettledBets) {
            const { user_id, username, bet_count } = row;

            const embed = new EmbedBuilder()
                .setTitle('⏳ Unsettled Bets Reminder')
                .setDescription(`<@${user_id}> - You have **${bet_count}** unsettled bet${bet_count > 1 ? 's' : ''} from yesterday. Please settle those before the recap at 11am!`)
                .setColor(0xFFA500)
                .setTimestamp();

            try {
                await recapChannel.send({ content: `<@${user_id}>`, embeds: [embed] });
            } catch (err) {
                console.error(`Failed to send reminder for ${username}:`, err.message);
            }
        }

        console.log('✅ Unsettled bet reminder check complete');
    } catch (err) {
        console.error('Error in unsettledBetReminder:', err);
    }
}

module.exports = { unsettledBetReminder };
