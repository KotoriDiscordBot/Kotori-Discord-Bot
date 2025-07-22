require('dotenv').config(); // Load environment variables

const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http'); // <-- Add HTTP server module

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const { createThread } = require('./threadCreator');

// Create a minimal HTTP server that responds to pings
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000);

client.once('ready', async () => {
  console.log('Bot is online!');
  const channel = await client.channels.fetch('1240048890175033396');
  await createThread(channel, '1397121138173149214', 'Raid');
});

// Use token from .env
client.login(process.env.DISCORD_TOKEN);
