require('dotenv').config(); // Load environment variables

const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const http = require('http');
const setupSchedules = require('./threadCreator');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // Required to receive DMs
});

// Create a minimal HTTP server that responds to pings
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000);

client.once('ready', () => {
  console.log(`✅ Bot is online and ready! [PID: ${process.pid}]`);
  setupSchedules(client);
});

// 📨 Cache to prevent duplicate DM forwarding
const recentDMs = new Set();

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Check if it's a DM
  if (message.channel.type === ChannelType.DM) {
    // Avoid duplicate handling
    if (recentDMs.has(message.id)) return;
    recentDMs.add(message.id);
    setTimeout(() => recentDMs.delete(message.id), 30 * 1000); // Keep for 30s

    console.log(`💬 [PID: ${process.pid}] DM from ${message.author.tag}: ${message.content}`);

    try {
      // Acknowledge the user
      await message.reply('Holi, este es el bot de Kotori. Tu mensaje será reenviado a Kotori real y recibirás una respuesta en cuanto sea posible. A no ser que seas Gum, en cuyo caso no responderé ✨');

      // Forward to your chosen channel
      const logChannel = await client.channels.fetch('1397418340074524847');
      if (logChannel && logChannel.isTextBased()) {
        console.log(`📤 [PID: ${process.pid}] Forwarding to channel: ${logChannel.name}`);

        // Compose the message with your format:
        const username = message.author.username;
        const userTag = message.author.tag.split('#')[0]; // part before #
        logChannel.send(`Mensaje de ${username} (${userTag}): ${message.content}`);
      } else {
        console.log('⚠️ Could not find a valid text channel to forward to.');
      }
    } catch (error) {
      console.error('❌ Error forwarding DM:', error);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
