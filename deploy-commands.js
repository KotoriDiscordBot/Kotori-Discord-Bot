require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('lod')
    .setDescription('Muestra los horarios de apertura de LOD en tu horario local.')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Replace this with your bot's CLIENT_ID and GUILD_ID
const CLIENT_ID = 'YOUR_CLIENT_ID';
const GUILD_ID = 'YOUR_GUILD_ID'; // Optional, for testing in a specific server

(async () => {
  try {
    console.log('🚀 Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), // Use this for testing
      // Routes.applicationCommands(CLIENT_ID), // Use this for global deployment (slow)
      { body: commands }
    );

    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
