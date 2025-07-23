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

// Register slash command /lod
client.once('ready', async () => {
  console.log(`✅ Bot is online and ready! [PID: ${process.pid}]`);
  setupSchedules(client);

  const commands = [
    new SlashCommandBuilder()
      .setName('lod')
      .setDescription('Muestra los horarios de apertura de LOD (en tu zona horaria)')
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

// Handle interaction for /lod
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

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

    // Use today's UTC year, month, day
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-based
    const day = now.getUTCDate();

    const lodList = hours.map(({ time, channels }) => {
      const [hour, minute] = time.split(':').map(Number);
      const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
      const unix = Math.floor(utcDate.getTime() / 1000);
      return `<t:${unix}:t> (${channels.join(', ')})`;
    });

    const embed = new EmbedBuilder()
  .setColor('#ff46da')
  .setTitle('🕰️ Horarios de LOD')
  .setDescription(`Las horas que se muestran corresponden a tu zona horaria\n\n${lodList.join('\n')}`);


    if (interaction.guild) {
      // In a guild: ephemeral reply using flag 64
      await interaction.reply({ embeds: [embed], flags: 64 });
    } else {
      // In DM: normal reply (visible to user)
      await interaction.reply({ embeds: [embed] });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

