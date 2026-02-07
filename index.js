require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { dailyStatsUpdate } = require('./tasks/daily-stats-update');
const { unsetledBetReminder } = require('./tasks/unsettled-bet-reminder');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ============================================================
// LOAD COMMANDS
// ============================================================
client.commands = new Collection();

const commandsPath = path.join(process.cwd(), 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    // ============================================================
    // UNSETTLED BET REMINDER - Runs at 10:00 AM EST
    // ============================================================
    cron.schedule('0 10 * * *', () => {
        unsetledBetReminder(client).catch(err => console.error('Reminder task error:', err));
    });

    // ============================================================
    // DAILY STATS UPDATE - Runs at 11:00 AM EST every day
    // ============================================================
    cron.schedule('0 11 * * *', () => {
        dailyStatsUpdate(client).catch(err => console.error('Daily stats task error:', err));
    });

    console.log('📅 Scheduled tasks loaded');
    console.log('  • Unsettled bet reminder: 10:00 AM EST');
    console.log('  • Daily stats update: 11:00 AM EST');
});

// ============================================================
// INTERACTION HANDLER
// ============================================================
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (err) {
        console.error(err);
        if (!interaction.replied) {
            await interaction.reply({
                content: 'There was an error executing this command.',
                ephemeral: true
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
