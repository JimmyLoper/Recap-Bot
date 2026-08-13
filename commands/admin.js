const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { dailyStatsUpdate } = require('../tasks/daily-stats-update');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin-only commands')

        // ------------------------------------------------------------
        // /admin resendrecap
        // ------------------------------------------------------------
        .addSubcommand(sub =>
            sub
                .setName('resendrecap')
                .setDescription('Delete today\'s recap messages and send fresh ones')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const overrideId = process.env.ADMIN_OVERRIDE_ID;

        // Permission gating
        if (interaction.user.id !== overrideId) {
            return interaction.reply({
                content: 'You are not authorized to use admin commands.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'resendrecap') return handleResendRecap(interaction);
    }
};

// ------------------------------------------------------------
// RESEND RECAP HANDLER
// ------------------------------------------------------------
async function handleResendRecap(interaction) {
    const recapChannelId = process.env.RECAP_CHANNEL_ID;

    if (!recapChannelId) {
        return interaction.reply({
            content: '❌ RECAP_CHANNEL_ID not set in environment variables.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Fetch recap channel
        const recapChannel = await interaction.client.channels.fetch(recapChannelId).catch(() => null);
        if (!recapChannel) {
            return interaction.editReply({
                content: `❌ Could not fetch recap channel ${recapChannelId}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Get today's date boundaries (midnight to now)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        const now = Date.now();

        console.log(`🔄 Deleting recap messages from ${today.toLocaleDateString()}...`);

        // Fetch messages from today
        const messages = await recapChannel.messages.fetch({ limit: 100 });
        let deletedCount = 0;

        for (const [id, message] of messages) {
            const messageTime = message.createdTimestamp;
            
            // Check if message was sent today and is from the bot
            if (messageTime >= todayTimestamp && messageTime <= now && message.author.id === interaction.client.user.id) {
                try {
                    await message.delete();
                    deletedCount++;
                    console.log(`  🗑️ Deleted message ${id}`);
                } catch (err) {
                    console.error(`  ❌ Failed to delete message ${id}:`, err.message);
                }
            }
        }

        console.log(`✅ Deleted ${deletedCount} recap messages`);

        // Send fresh recap
        console.log('📊 Sending fresh recap...');
        await dailyStatsUpdate(interaction.client);

        return interaction.editReply({
            content: `✅ Deleted ${deletedCount} recap message(s) and sent fresh recap!`,
            flags: MessageFlags.Ephemeral
        });

    } catch (err) {
        console.error('Error in resendrecap:', err);
        return interaction.editReply({
            content: `❌ Error: ${err.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
