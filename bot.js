require('dotenv').config();

// ===== GLOBAL ERROR HANDLERS =====
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
});

// ===== DISCORD.JS IMPORT =====
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const http = require('http');

console.log("⏳ Importing threadCreator...");
let setupSchedules;
try {
  setupSchedules = require('./threadCreator');
  console.log("✅ threadCreator loaded successfully.");
} catch (err) {
  console.error("❌ Failed to load threadCreator:", err);
}

// ===== CLIENT INIT =====
console.log("⏳ Initializing Discord client...");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});
console.log("✅ Client initialized.");

// ===== HTTP KEEPALIVE =====
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000, () => {
  console.log(`🌐 HTTP server running on port ${process.env.PORT || 3000}`);
});

// ===== READY EVENT =====
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag} (${client.user.id}) [PID: ${process.pid}]`);
  console.log('⏳ Starting scheduled jobs setup...');

  if (setupSchedules) {
    try {
      await setupSchedules(client);
      console.log("✅ setupSchedules executed.");
    } catch (err) {
      console.error("❌ setupSchedules failed:", err);
    }
  } else {
    console.log("⚠️ No setupSchedules function to execute.");
  }
});

// ===== DEBUG, ERROR, WARN EVENTS =====
client.on('debug', info => {
  console.log('🐛 [discord.js debug]', info);
});
client.on('error', error => {
  console.error('❌ [discord.js error]', error);
});
client.on('warn', warning => {
  console.warn('⚠️ [discord.js warning]', warning);
});

// ===== LOGIN =====
console.log("⏳ Logging in...");
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log("🔑 Logged in successfully (login promise resolved). Waiting for ready event..."))
  .catch(err => {
    console.error("❌ Failed to login:", err);
    process.exit(1);
  });
