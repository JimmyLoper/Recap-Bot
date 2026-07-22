const { SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto');
const db = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendlink')
        .setDescription('Admin: send a capper their personal bet history link')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The capper to send a link to')
                .setRequired(true)
        ),

    async execute(interaction) {
        const overrideId = process.env.ADMIN_OVERRIDE_ID;

        // Permission gating (matches admin.js)
        if (interaction.user.id !== overrideId) {
            return interaction.reply({
                content: 'You are not authorized to use admin commands.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');

        await interaction.deferReply({ ephemeral: true });

        try {
            const { rows } = await db.query(
                `SELECT username FROM capper_info WHERE user_id = $1`,
                [targetUser.id]
            );

            if (rows.length === 0) {
                return interaction.editReply({
                    content: '⚠️ Capper not found in database',
                    ephemeral: true
                });
            }

            const token = crypto.randomUUID();

            await db.query(
                `UPDATE capper_info SET token = $1 WHERE user_id = $2`,
                [token, targetUser.id]
            );

            const url = `${process.env.WEB_URL}/history?token=${token}`;

            try {
                await targetUser.send(`Here is your personal bet history link: ${url}. Keep this private.`);
            } catch (dmErr) {
                console.error(`Failed to DM ${rows[0].username}:`, dmErr.message);
                return interaction.editReply({
                    content: `❌ Could not DM ${rows[0].username} — they may have DMs disabled.`,
                    ephemeral: true
                });
            }

            return interaction.editReply({
                content: `✅ Link sent to ${rows[0].username}`,
                ephemeral: true
            });

        } catch (err) {
            console.error('Error in sendlink command:', err);
            return interaction.editReply({
                content: `❌ Error: ${err.message}`,
                ephemeral: true
            });
        }
    }
};
