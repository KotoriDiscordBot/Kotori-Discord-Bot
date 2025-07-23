require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('lod')
    .setDescription('Muestra los horarios de apertura de LOD en tu horario local.')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const CLIENT_ID = '1397127326722162688'; // Your bot's client ID

(async () => {
  try {
    console.log('🚀 Started refreshing global application (/) commands.');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID), // Global registration
      { body: commands }
    );

    console.log('✅ Successfully reloaded global application (/) commands.');
    console.log('🌐 It may take up to 1 hour for changes to appear in all servers.');
  } catch (error) {
    console.error('❌ Error reloading commands:', error);
  }
})();
