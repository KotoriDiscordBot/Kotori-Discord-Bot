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

  // Use today's date in Europe/Madrid as a string
  const now = new Date();

  // Get the current date in Europe/Madrid timezone as YYYY-MM-DD
  const spainDateParts = now.toLocaleString('en-GB', { timeZone: 'Europe/Madrid' }).split(',')[0].split('/');
  // Day/Month/Year from en-GB date format
  const [day, month, year] = spainDateParts.map(Number);

  // Helper to parse Europe/Madrid time string into a Date (in UTC)
  function getUnixFromMadridTime(timeStr) {
    // Compose a date string with Spain local time
    const [hour, minute] = timeStr.split(':').map(Number);
    // Construct a string that JS Date can parse as local in Europe/Madrid by using toLocaleString
    // We build a date-time string and parse it with Spain TZ to get equivalent UTC time:
    const madridDateString = new Date(Date.UTC(year, month - 1, day, hour, minute));

    // To get correct UTC timestamp for that Europe/Madrid time, we:
    // 1. Format the date as Europe/Madrid time (the one we want)
    // 2. Parse it as if it were UTC so we get the correct offset applied

    // Step 1: Format in Europe/Madrid timezone (this returns a string with local time)
    const localSpainString = madridDateString.toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour12: false });

    // Step 2: Parse back that string as if it were UTC time (hacky but works)
    const [datePart, timePart] = localSpainString.split(', ');
    const [d, m, y] = datePart.split('/').map(Number);
    const [h, min] = timePart.split(':').map(Number);

    // Now create a date object in UTC with these parts
    const utcDate = new Date(Date.UTC(y, m - 1, d, h, min));

    return Math.floor(utcDate.getTime() / 1000);
  }

  const lodList = hours.map(({ time, channels }) => {
    const unix = getUnixFromMadridTime(time);
    return `<t:${unix}:t> (${channels.join(', ')})`;
  });

  const embed = new EmbedBuilder()
    .setColor('#ff46da')
    .setDescription(`🕘 Horarios de apertura de LOD (se muestra en tu horario)\n\n${lodList.join('\n')}`);

  await interaction.reply({ embeds: [embed], flags: 64 });
}



client.login(process.env.DISCORD_TOKEN);

