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
  console.log('✅ Bot is online and ready!');
  setupSchedules(client);
});

// 📨 Listen for DMs and forward them
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Check if it's a DM
  if (message.channel.type === ChannelType.DM) {
    console.log(`💬 DM from ${message.author.tag}: ${message.content}`);

    try {
      // Acknowledge the user
      await message.reply('📬 Your message has been forwarded to the admin.');

      // Forward to your chosen channel
      const logChannel = await client.channels.fetch('1397418340074524847');
      if (logChannel && logChannel.isTextBased()) {
        console.log('📤 Forwarding to channel:', logChannel.name);
        logChannel.send(`**${message.author.tag}** says: ${message.content}`);
      } else {
        console.log('⚠️ Could not find a valid text channel to forward to.');
      }
    } catch (error) {
      console.error('❌ Error forwarding DM:', error);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
