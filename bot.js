require('dotenv').config(); // Load environment variables

// ===== GLOBAL ERROR HANDLERS =====
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
});

// ===== DISCORD.JS IMPORT =====
const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require('discord.js');

const http = require('http');
const path = require('path');

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

// Print token length for debug (do NOT print the token itself)
if (process.env.DISCORD_TOKEN) {
  console.log(🔐 DISCORD_TOKEN length: ${process.env.DISCORD_TOKEN.length} characters);
} else {
  console.warn("⚠️ DISCORD_TOKEN environment variable is NOT set!");
}

// 🌟 Toggle ephemeral replies in guilds
const USE_EPHEMERAL_IN_GUILDS = true;
function smartReply(interaction, embed) {
  return interaction.reply({
    embeds: [embed],
    flags: interaction.guild && USE_EPHEMERAL_IN_GUILDS ? 64 : undefined
  });
}

// ===== HTTP KEEPALIVE =====
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000, () => {
  console.log(🌐 HTTP server running on port ${process.env.PORT || 3000});
});

// ===== READY EVENT =====
client.once('ready', async () => {
  console.log(🤖 Logged in as ${client.user.tag} (${client.user.id}) [PID: ${process.pid}]);
  
  if (setupSchedules) {
    try {
      setupSchedules(client);
      console.log("✅ setupSchedules executed.");
    } catch (err) {
      console.error("❌ setupSchedules failed:", err);
    }
  }

  try {
    console.log("⏳ Fetching channel for buttons...");
    const channel = await client.channels.fetch('1397824284243791965');
    console.log("✅ Channel fetched:", channel?.name || "Not found");

    if (!channel || !channel.isTextBased()) {
      console.log('⚠️ Channel for button not found or is not text-based');
      return;
    }

    const button = new ButtonBuilder()
      .setCustomId('send_message_button')
      .setLabel('Enviar mensaje')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✉️');

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({
      content: 'Utiliza este botón para enviar un mensaje a un canal o usuario:',
      components: [row]
    });

    const buttonListas = new ButtonBuilder()
      .setLabel('Listas')
      .setStyle(ButtonStyle.Link)
      .setURL('https://docs.google.com/document/d/1VUjL6xGj6c_Hzqa92dnNjY1FkJ6Wjak642nRMzJ595w/edit?usp=sharing');

    const buttonTimestamps = new ButtonBuilder()
      .setLabel('Timestamps')
      .setStyle(ButtonStyle.Link)
      .setURL('https://docs.google.com/spreadsheets/d/1K0yoeyLLIEsbP_DiO33vxCES3SSmX8VIzvm0PhJj6OY/edit?usp=sharing');

    const buttonNosAssistant = new ButtonBuilder()
      .setLabel('NosAssistant')
      .setStyle(ButtonStyle.Link)
      .setURL('https://buy.stripe.com/28og0x5NS7mTek0dQU');

    const buttonPhoenix = new ButtonBuilder()
      .setLabel('Phoenix')
      .setStyle(ButtonStyle.Link)
      .setURL('https://checkout.stripe.com/c/pay/cs_live_a1Y4pxC8LT7R1TWzqJvdtJDs9Rn38GS1NcTAZ3RvJxuUtZ8gCMTPI6nfSU#fidkdWxOYHwnPyd1blppbHNgWjA0THNXcDFESFAzXTd3dzZkXU9fRHA0a282cWNpNU9valZpYGlpMjBSR28zVHdRXGJiQzZcMTZWSUhSaVFHMEdGM3NRbE5QYk09QUJzV05LVkF0aU8yRGM8NTU0czRoamI0QicpJ2N3amhWYHdzYHcnP3F3cGApJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl');

    const quickLinksRow = new ActionRowBuilder()
      .addComponents(buttonListas, buttonTimestamps, buttonNosAssistant, buttonPhoenix);

    await channel.send({
      content: 'Links:',
      components: [quickLinksRow],
    });

    console.log('✅ Buttons sent.');
  } catch (error) {
    console.error('❌ Error sending message with button:', error);
  }

  // ===== REGISTER SLASH COMMANDS =====
  try {
    console.log('🔄 Refreshing application (/) commands...');
    const commands = [
      new SlashCommandBuilder().setName('comandos').setDescription('Muestra una lista de todos los comandos disponibles y sus funciones').toJSON(),
      new SlashCommandBuilder().setName('lod').setDescription('Muestra los horarios de apertura de LOD (en tu zona horaria)').toJSON(),
      new SlashCommandBuilder().setName('caligor').setDescription('Muestra los horarios de Caligor (en tu zona horaria)').toJSON(),
      new SlashCommandBuilder().setName('fichashardcore').setDescription('Calcula cuántas fichas te faltan para el libro de ataque.').toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
  }
});

// ===== DM HANDLER =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.type === ChannelType.DM) {
    console.log(💬 DM from ${message.author.tag}: ${message.content});
  }
});

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
