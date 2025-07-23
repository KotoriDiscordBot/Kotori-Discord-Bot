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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.type === ChannelType.DM) {
    if (recentDMs.has(message.id)) return;
    recentDMs.add(message.id);
    setTimeout(() => recentDMs.delete(message.id), 30 * 1000); // Keep for 30s

    console.log(`💬 [PID: ${process.pid}] DM from ${message.author.tag}: ${message.content}`);

    try {
      await message.reply('Holi, este es el bot de Kotori. Tu mensaje será reenviado a la verdadera Kotori y recibirás una respuesta en cuanto sea posible. A no ser que seas Gum, en cuyo caso no recibirás ninguna respuesta ✨');

      const logChannel = await client.channels.fetch('1397418340074524847');
      if (logChannel && logChannel.isTextBased()) {
        console.log(`📤 [PID: ${process.pid}] Forwarding to channel: ${logChannel.name}`);

        const displayName = message.author.globalName || message.author.username;
        const username = message.author.username;

        // Create an embed with your desired color for the DM log message
        const dmEmbed = new EmbedBuilder()
          .setColor('#ff46da')
          .setDescription(`Mensaje de ${displayName} (${username}): ${message.content}`);

        logChannel.send({ embeds: [dmEmbed] });
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
      { time: '00:00', channels: ['CH7'] },
      { time: '03:00', channels: ['CH1'] },
      { time: '06:00', channels: ['CH1'] },
      { time: '09:00', channels: ['CH2'] },
      { time: '12:00', channels: ['CH3'] },
      { time: '15:00', channels: ['CH2', 'CH3', 'CH6'] },
      { time: '18:00', channels: ['CH4', 'CH5', 'CH7'] },
      { time: '21:00', channels: ['CH4', 'CH5', 'CH6'] },
    ];

    // Function to get Spain's current UTC offset (1 or 2)
    function getSpainOffset(date) {
      const options = { timeZone: 'Europe/Madrid', timeZoneName: 'short' };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(date);
      const tzPart = parts.find(part => part.type === 'timeZoneName')?.value || '';
      const match = tzPart.match(/GMT([+-]\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return 1; // fallback CET
    }

    const now = new Date();
    const spainOffset = getSpainOffset(now); // 1 or 2

    // Extract day/month/year for Spain timezone
    const spainDateString = now.toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid' });
    const [day, month, year] = spainDateString.split('/').map(Number);

    // Get base UTC midnight timestamp for Spain's current day
    const baseDateUTC = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

    const lodList = hours.map(({ time, channels }) => {
      const [hour, minute] = time.split(':').map(Number);

      // Calculate the unix timestamp considering Spain's offset + hour
      const timestamp = (baseDateUTC + ((spainOffset + hour) * 3600000) + (minute * 60000)) / 1000;

      return `<t:${Math.floor(timestamp)}:t> (${channels.join(', ')})`;
    });

    const embed = new EmbedBuilder()
      .setColor('#ff46da')
      .setDescription(`🕘 Horarios de apertura de LOD (se muestra en tu horario)\n\n${lodList.join('\n')}`);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});



client.login(process.env.DISCORD_TOKEN);

