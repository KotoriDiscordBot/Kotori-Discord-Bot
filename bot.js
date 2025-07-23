require('dotenv').config(); // Load environment variables

const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require('discord.js');
const http = require('http');
const path = require('path');  // <-- Added this line to handle file paths
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

// 🌟 CONTROL THIS TO TOGGLE EPHEMERAL IN GUILDS 🌟
const USE_EPHEMERAL_IN_GUILDS = true;

// 📩 Smart reply helper (ephemeral in guilds, visible in DMs)
function smartReply(interaction, embed) {
  return interaction.reply({
    embeds: [embed],
    flags: interaction.guild && USE_EPHEMERAL_IN_GUILDS ? 64 : undefined
  });
}

// Create a minimal HTTP server that responds to pings
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000);

// Register slash command /lod, /caligor, and /fichashardcore
client.once('ready', async () => {
  console.log(`✅ Bot is online and ready! [PID: ${process.pid}]`);
  setupSchedules(client);

  const commands = [
    new SlashCommandBuilder()
      .setName('lod')
      .setDescription('Muestra los horarios de apertura de LOD (en tu zona horaria)')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('caligor')
      .setDescription('Muestra los horarios de Caligor (en tu zona horaria)')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('fichashardcore')
      .setDescription('Archivo de Excel para ayudar con el control de fichas para el libro de 100 ataque. Hecho por Kurapikaa')
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Refreshing application (/) commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Successfully registered slash commands.');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
  }
});

// 📨 Cache to prevent duplicate DM forwarding
const recentDMs = new Set();
const greetedUsers = new Set();

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.type === ChannelType.DM) {
    if (recentDMs.has(message.id)) return;
    recentDMs.add(message.id);
    setTimeout(() => recentDMs.delete(message.id), 30 * 1000); // Keep for 30s

    console.log(`💬 [PID: ${process.pid}] DM from ${message.author.tag}: ${message.content}`);

    try {
      if (!greetedUsers.has(message.author.id)) {
        await message.reply('Holi, este es el bot de Kotori. Tu mensaje será reenviado a la verdadera Kotori y recibirás una respuesta en cuanto sea posible. A no ser que seas Gum, en cuyo caso no recibirás ninguna respuesta ✨');
        greetedUsers.add(message.author.id);
      }

      const logChannel = await client.channels.fetch('1397418340074524847');
      if (logChannel && logChannel.isTextBased()) {
        console.log(`📤 [PID: ${process.pid}] Forwarding to channel: ${logChannel.name}`);

        const displayName = message.author.globalName || message.author.username;
        const username = message.author.username;

        const dmEmbed = new EmbedBuilder()
          .setColor('#ff46da')
          .setDescription(`Mensaje de ${displayName} (${username}): ${message.content}`);

        await logChannel.send({ embeds: [dmEmbed] });
      } else {
        console.log('⚠️ Could not find a valid text channel to forward to.');
      }
    } catch (error) {
      console.error('❌ Error forwarding DM:', error);
    }
  }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // LOD command
  if (interaction.commandName === 'lod') {
    const hours = [
      { time: '22:00', channels: ['CH7'] },
      { time: '01:00', channels: ['CH1'] },
      { time: '04:00', channels: ['CH1'] },
      { time: '07:00', channels: ['CH2'] },
      { time: '10:00', channels: ['CH3'] },
      { time: '13:00', channels: ['CH2', 'CH3', 'CH6'] },
      { time: '16:00', channels: ['CH4', 'CH5', 'CH7'] },
      { time: '19:00', channels: ['CH4', 'CH5', 'CH6'] },
    ];

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    const lodList = hours.map(({ time, channels }) => {
      const [hour, minute] = time.split(':').map(Number);
      const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
      const unix = Math.floor(utcDate.getTime() / 1000);
      return `<t:${unix}:t> (${channels.join(', ')})`;
    });

    const embed = new EmbedBuilder()
      .setColor('#ff46da')
      .setTitle('Horarios de LOD')
      .setDescription(`\n\n${lodList.join('\n')}`);

    await smartReply(interaction, embed);
  }

  // Caligor command
  if (interaction.commandName === 'caligor') {
    const times = ['15:00', '18:00'];
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    const caligorList = times.map((time, index) => {
      const [hour, minute] = time.split(':').map(Number);
      const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
      const unix = Math.floor(utcDate.getTime() / 1000);

      const label = index === 0 ? 'Primer Caligor' : 'Segundo Caligor';
      return `<t:${unix}:t> (${label})`;
    });

    const embed = new EmbedBuilder()
      .setColor('#ff46da')
      .setTitle('Horarios de Caligor')
      .setDescription(`Sábados y domingos\n\n${caligorList.join('\n')}`);

    await smartReply(interaction, embed);
  }

  // Fichas Hardcore Excel file command
  if (interaction.commandName === 'fichashardcore') {
    const filePath = path.join(__dirname, 'FichasHC.xlsx'); // Adjust path if necessary

    await interaction.reply({
      content: 'Aquí tienes el archivo Excel para el control de fichas 📄',
      files: [filePath],
      flags: interaction.guild && USE_EPHEMERAL_IN_GUILDS ? 64 : undefined
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
