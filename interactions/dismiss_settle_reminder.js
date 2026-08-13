const { MessageFlags } = require('discord.js');

module.exports = {
    customIds: ['dismiss_settle_reminder'],

    async execute(interaction) {
        try {
            // Delete the message
            await interaction.message.delete();
            
            // Send confirmation to user
            await interaction.reply({
                content: 'Reminder dismissed. Your webpage link remains pinned to the channel for you to access.',
                flags: MessageFlags.Ephemeral // Ephemeral message
            });
        } catch (err) {
            console.error('Error deleting unsettled reminder message:', err);
            await interaction.reply({
                content: 'Error dismissing reminder.',
                flags: MessageFlags.Ephemeral // Ephemeral message
            });
        }
    }
};
