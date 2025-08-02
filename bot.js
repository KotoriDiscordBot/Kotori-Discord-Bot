require('dotenv').config(); // Load environment variables

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
const path = require('path');  // <-- For file paths
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

// === ADD BUTTON TO SPECIFIC MESSAGE ON READY ===
client.once('ready', async () => {
  console.log(`✅ Bot is online and ready! [PID: ${process.pid}]`);
  setupSchedules(client);

  try {
    const channel = await client.channels.fetch('1397824284243791965');
    if (!channel || !channel.isTextBased()) {
      console.log('⚠️ Channel for button not found or is not text-based');
      return;
    }

    // Send a new message with the button
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
    // Your 4 link buttons
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

    console.log('✅ "Enviar mensaje" button sent in new message.');
  } catch (error) {
    console.error('❌ Error sending message with button:', error);
  }

  // Register slash commands as before
  const commands = [
    new SlashCommandBuilder()
      .setName('comandos')
      .setDescription('Muestra una lista de todos los comandos disponibles y sus funciones')
      .toJSON(),
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
      .setDescription('Calcula cuántas fichas te faltan para el libro de ataque. Excel hecho por Kurapikaa')
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

// Handle slash commands and other interactions
client.on('interactionCreate', async (interaction) => {
  // === Modal submit handler first ===
  if (interaction.type === InteractionType.ModalSubmit) {
    if (interaction.customId === 'send_message_modal') {
      const targetId = interaction.fields.getTextInputValue('target_id_input').trim();
      const messageContent = interaction.fields.getTextInputValue('message_content_input').trim();

      try {
        // Try fetching as channel first
        let target = null;
        try {
          target = await client.channels.fetch(targetId);
          if (!target || !target.isTextBased()) {
            target = null; // Not a text channel
          }
        } catch {
          target = null;
        }

        // If not a channel, try user DM
        if (!target) {
          try {
            const user = await client.users.fetch(targetId);
            if (user) {
              target = await user.createDM();
            }
          } catch {
            target = null;
          }
        }

        if (!target) {
          await interaction.reply({ content: '❌ ID inválida: no se encontró canal ni usuario con ese ID.', flags: 64 });
          return;
        }

        // Send message to target
        await target.send(messageContent);
        await interaction.reply({ content: `✅ Mensaje enviado a <#${targetId}> o <@${targetId}>`, flags: 64 });
      } catch (error) {
        console.error('❌ Error sending message to target:', error);
        await interaction.reply({ content: '❌ Error al enviar el mensaje. Revisa permisos y que la ID sea correcta.', flags: 64 });
      }
    }
    return; // Done processing modal
  }

  // === Button click handler ===
  if (interaction.isButton()) {
    if (interaction.customId === 'send_message_button') {
      // Show modal for input
      const modal = new ModalBuilder()
        .setCustomId('send_message_modal')
        .setTitle('Enviar mensaje');

      const targetInput = new TextInputBuilder()
        .setCustomId('target_id_input')
        .setLabel('ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ID de usuario o canal')
        .setRequired(true);

      const messageInput = new TextInputBuilder()
        .setCustomId('message_content_input')
        .setLabel('Mensaje')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Escribe el mensaje aquí')
        .setRequired(true);

      // Each input must be wrapped in an ActionRow
      const firstActionRow = new ActionRowBuilder().addComponents(targetInput);
      const secondActionRow = new ActionRowBuilder().addComponents(messageInput);

      modal.addComponents(firstActionRow, secondActionRow);

      await interaction.showModal(modal);
    }
    return; // Done processing button
  }

  // === Chat Input Commands ===
  if (!interaction.isChatInputCommand()) return;

  // Your slash commands follow here:
  if (interaction.commandName === 'comandos') {
    const embed = new EmbedBuilder()
      .setColor('#ff46da')
      .setTitle('Lista de comandos')
      .setDescription([
        '**/comandos** - Muestra una lista de todos los comandos disponibles y sus funciones',
        '**/lod** - Muestra los horarios de apertura de LOD (en tu zona horaria)',
        '**/caligor** - Muestra los horarios de Caligor (en tu zona horaria)',
        '**/fichashardcore** - Calcula cuántas fichas te faltan para el libro de ataque. Excel hecho por Kurapikaa'
      ].join('\n'));

    await smartReply(interaction, embed);
    return;
  }

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
    return;
  }

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
    return;
  }

  if (interaction.commandName === 'fichashardcore') {
    const filePath = path.join(__dirname, 'FichasHC.xlsx'); // Correct file path

    await interaction.reply({
      content: 'Rellena este archivo con tus fichas HC individuales y tus fichas HC de acto para saber cuánto te falta para el libro de ataque. Créditos a Kurapikaa',
      files: [filePath],
      flags: undefined // Force non-ephemeral message in guilds
    });
    return;
  }
});

// === Custom !links command (for specific user IDs only) ===
client.on('messageCreate', async (message) => {
  // Ignore bots or non-commands
  if (message.author.bot || !message.content.startsWith('!links')) return;

  const allowedUserIds = ['808865358659584011', '224999065069289472'];
  if (!allowedUserIds.includes(message.author.id)) return; // Block access silently

  // Build buttons
  const buttonNos = new ButtonBuilder()
    .setLabel('NosAssistant')
    .setStyle(ButtonStyle.Link)
    .setURL('https://buy.stripe.com/28og0x5NS7mTek0dQU');

  const buttonPhoenix = new ButtonBuilder()
    .setLabel('Phoenix')
    .setStyle(ButtonStyle.Link)
    .setURL('https://checkout.stripe.com/c/pay/cs_live_a1Y4pxC8LT7R1TWzqJvdtJDs9Rn38GS1NcTAZ3RvJxuUtZ8gCMTPI6nfSU#fidkdWxOYHwnPyd1blppbHNgWjA0THNXcDFESFAzXTd3dzZkXU9fRHA0a282cWNpNU9valZpYGlpMjBSR28zVHdRXGJiQzZcMTZWSUhSaVFHMEdGM3NRbE5QYk09QUJzV05LVkF0aU8yRGM8NTU0czRoamI0QicpJ2N3amhWYHdzYHcnP3F3cGApJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYHgl');

  const row = new ActionRowBuilder().addComponents(buttonNos, buttonPhoenix);

  await message.channel.send({
    content: 'Muchas gracias ❤️',
    components: [row]
  });
});

client.login(process.env.DISCORD_TOKEN);
