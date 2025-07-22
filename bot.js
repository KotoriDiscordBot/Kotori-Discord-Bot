require('dotenv').config(); // Load environment variables

const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const { createThread } = require('./threadCreator');

client.once('ready', async () => {
  console.log('Bot is online!');
  const channel = await client.channels.fetch('1240048890175033396');
  await createThread(channel, '1397121138173149214', 'Raid');
});

// Use token from .env
client.login(process.env.DISCORD_TOKEN);