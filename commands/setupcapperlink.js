const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const crypto = require('crypto');
const db = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setupcapperlink')
        .setDescription('Admin: post and pin a capper\'s personal history link in their tracker channel')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The capper to set up a pinned link for')
                .setRequired(true)
        ),

    async execute(interaction) {
        const overrideId = process.env.ADMIN_OVERRIDE_ID;

        // Permission gating (matches admin.js)
        if (interaction.user.id !== overrideId) {
            return interaction.reply({
                content: 'You are not authorized to use admin commands.',
                flags: MessageFlags.Ephemeral
            });
        }

        const targetUser = interaction.options.getUser('user');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { rows } = await db.query(
                `SELECT username, tracker_channel_id FROM capper_info WHERE user_id = $1`,
                [targetUser.id]
            );

            if (rows.length === 0) {
                return interaction.editReply({
                    content: '⚠️ Capper not found in database',
                    flags: MessageFlags.Ephemeral
                });
            }

            const capper = rows[0];
            if (!capper.tracker_channel_id) {
                return interaction.editReply({
                    content: `⚠️ ${capper.username} does not have a tracker channel set.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const trackerChannel = await interaction.client.channels.fetch(capper.tracker_channel_id).catch(() => null);
            if (!trackerChannel || !trackerChannel.isTextBased()) {
                return interaction.editReply({
                    content: `❌ Could not access tracker channel ${capper.tracker_channel_id} for ${capper.username}.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const token = crypto.randomUUID();

            await db.query(
                `UPDATE capper_info SET token = $1 WHERE user_id = $2`,
                [token, targetUser.id]
            );

            const url = `${process.env.WEB_URL}/history?token=${token}`;
            const linkMessage = await trackerChannel.send(
                `🔗 Personal bet history link: ${url}`
            );

            let pinNotice = 'Pinned in tracker channel.';
            try {
                await linkMessage.pin();
            } catch (pinErr) {
                console.error(`Failed to pin link message for ${capper.username}:`, pinErr.message);
                pinNotice = 'Link sent, but pinning failed (check bot Manage Messages permission).';
            }

            return interaction.editReply({
                content: `✅ Link posted for ${capper.username} in <#${capper.tracker_channel_id}>. ${pinNotice}`,
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            console.error('Error in setupcapperlink command:', err);
            return interaction.editReply({
                content: `❌ Error: ${err.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
