const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { dailyStatsUpdate } = require('../tasks/daily-stats-update');
const { unsettledBetReminder } = require('../tasks/unsettled-bet-reminder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test')
        .setDescription('Test command for tracker bot tasks')
        .addStringOption(opt =>
            opt.setName('task')
                .setDescription('Which task to test')
                .setRequired(true)
                .addChoices(
                    { name: 'Daily Stats', value: 'daily-stats' },
                    { name: 'Unsettled Bets Reminder', value: 'unsettled-reminder' },
                    { name: 'Both Tasks', value: 'both' }
                )
        ),

    async execute(interaction) {
        const task = interaction.options.getString('task');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            if (task === 'daily-stats' || task === 'both') {
                console.log('🧪 Testing dailyStatsUpdate...');
                await dailyStatsUpdate(interaction.client);
            }

            if (task === 'unsettled-reminder' || task === 'both') {
                console.log('🧪 Testing unsettledBetReminder...');
                await unsettledBetReminder(interaction.client);
            }

            return interaction.editReply({
                content: `✅ Test task(s) completed successfully!`,
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            console.error('Error in test command:', err);
            return interaction.editReply({
                content: `❌ Error running test task: ${err.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
