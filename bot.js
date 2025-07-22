require('dotenv').config(); // Load environment variables

const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');
const setupSchedules = require('./threadCreator'); // <-- Correct import for the scheduled job

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Create a minimal HTTP server that responds to pings
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000);

client.once('ready', () => {
  console.log('✅ Bot is online and ready!');
  setupSchedules(client); // <-- This starts your daily 18:00 scheduler
});

// Use token from .env
client.login(process.env.DISCORD_TOKEN);
