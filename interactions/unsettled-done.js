module.exports = {
    customIds: ['unsettled_done'],

    async execute(interaction) {
        try {
            // Delete the message
            await interaction.message.delete();
            
            // Send confirmation to user
            await interaction.reply({
                content: '✅ Reminder dismissed. Great job settling those bets!',
                ephemeral: true
            });
        } catch (err) {
            console.error('Error deleting unsettled reminder message:', err);
            await interaction.reply({
                content: 'Error dismissing reminder.',
                ephemeral: true
            });
        }
    }
};
