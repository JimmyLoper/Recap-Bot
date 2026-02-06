const db = require('../utils/db');
const { EmbedBuilder } = require('discord.js');

async function unsettledBetReminder(client) {
    console.log('🔔 Checking for unsettled bets...');

    try {
        // Fetch all active cappers with unsettled bets placed before today at 12am
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to midnight of today
        const todayTimestamp = today.getTime();

        const { rows: unsettledBets } = await db.query(
            `SELECT DISTINCT cnr.user_id, cnr.username, cnr.tracker_channel_id, COUNT(b.id) as bet_count
             FROM capper_info cnr
             JOIN bets b ON cnr.user_id = b.user_id
             WHERE cnr.active = 'yes' AND b.result = 'pending' AND b.timestamp < $1
             GROUP BY cnr.user_id, cnr.username, cnr.tracker_channel_id`,
            [todayTimestamp]
        );

        for (const row of unsettledBets) {
            const { user_id, username, tracker_channel_id, bet_count } = row;

            if (!tracker_channel_id) {
                console.warn(`⚠️ No tracker channel set for ${username}`);
                continue;
            }

            const trackerChannel = await client.channels.fetch(tracker_channel_id).catch(() => null);
            if (!trackerChannel) {
                console.warn(`⚠️ Could not fetch tracker channel ${tracker_channel_id} for ${username}`);
                continue;
            }

            const embed = new EmbedBuilder()
                .setTitle('⏳ Unsettled Bets Reminder')
                .setDescription(`You have **${bet_count}** unsettled bet${bet_count > 1 ? 's' : ''} from yesterday. Please settle those before the recap at 11am!`)
                .setColor(0xFFA500)
                .setTimestamp();

            try {
                await trackerChannel.send({ content: `<@${user_id}>`, embeds: [embed] });
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
