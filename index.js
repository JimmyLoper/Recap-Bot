require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { dailyStatsUpdate } = require('./tasks/daily-stats-update');
const { unsettledBetReminder } = require('./tasks/unsettled-bet-reminder');

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

// ============================================================
// LOAD INTERACTION HANDLERS (buttons, modals, selects)
// ============================================================
client.interactions = new Collection();

const interactionsPath = path.join(process.cwd(), 'interactions');
if (fs.existsSync(interactionsPath)) {
    const interactionFiles = fs.readdirSync(interactionsPath).filter(file => file.endsWith('.js'));

    for (const file of interactionFiles) {
        const filePath = path.join(interactionsPath, file);
        const interaction = require(filePath);
        
        if (interaction.customIds && Array.isArray(interaction.customIds)) {
            for (const id of interaction.customIds) {
                client.interactions.set(id, interaction);
            }
        }
    }
    console.log(`Loaded ${client.interactions.size} interaction handlers`);
}

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    // ============================================================
    // UNSETTLED BET REMINDER - Runs at 10:00 AM EST
    // ============================================================
    cron.schedule('0 10 * * *', () => {
        unsettledBetReminder(client).catch(err => console.error('Reminder task error:', err));
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
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
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
        return;
    }

    // Handle button/modal/select interactions
    if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
        // Find matching handler by prefix match
        for (const [prefix, handler] of client.interactions) {
            if (interaction.customId.startsWith(prefix)) {
                try {
                    await handler.execute(interaction);
                } catch (err) {
                    console.error('Error handling interaction:', err);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'There was an error processing this interaction.',
                            ephemeral: true
                        }).catch(() => {});
                    }
                }
                return;
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
