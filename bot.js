require('dotenv').config();

const { MongoClient } = require('mongodb');
const http = require('http');

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');


// ========================================
// MONGODB
// ========================================

const mongoClient = new MongoClient(process.env.MONGODB_URI);

let linksCollection;


// ========================================
// GLOBAL ERROR HANDLERS
// ========================================

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
});

process.on('uncaughtExceptionMonitor', error => {
  console.error('❌ Uncaught exception monitor:', error);
});

process.on('warning', warning => {
  console.warn('⚠️ Node warning:', warning);
});

process.on('SIGINT', async () => {

  console.log('⚠️ Bot shutting down (SIGINT)');

  try {
    await mongoClient.close();
    console.log('✅ MongoDB connection closed');
  } catch (err) {
    console.error('❌ Error while closing MongoDB:', err);
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {

  console.log('⚠️ Bot shutting down (SIGTERM)');

  try {
    await mongoClient.close();
    console.log('✅ MongoDB connection closed');
  } catch (err) {
    console.error('❌ Error while closing MongoDB:', err);
  }

  process.exit(0);
});


// ========================================
// CLIENT SETUP
// ========================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});


// ========================================
// DISCORD DEBUGGING
// ========================================

client.on('disconnect', event => {
  console.warn('⚠️ Discord disconnected:', event);
});

client.on('reconnecting', () => {
  console.log('🔄 Discord reconnecting...');
});

client.on('resume', replayed => {
  console.log(`✅ Discord resumed (${replayed} events replayed)`);
});

client.on('shardError', error => {
  console.error('❌ WebSocket shard error:', error);
});

client.on('invalidated', () => {
  console.error('❌ Discord session invalidated');
});


// ========================================
// KEEPALIVE SERVER
// ========================================

http.createServer((req, res) => {

  res.writeHead(200);
  res.end('Bot is awake!');

}).listen(process.env.PORT || 3000, () => {

  console.log(`🌐 Keepalive server running on port ${process.env.PORT || 3000}`);

});


// ========================================
// SLASH COMMANDS
// ========================================

const commands = [

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Save a link (use /get to randomly receive one of your saved links)')
    .addStringOption(option =>
      option
        .setName('link')
        .setDescription('The link you want to save for later')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('get')
    .setDescription('Get a random saved link'),

  new SlashCommandBuilder()
    .setName('count')
    .setDescription('Check how many links you have left')

].map(command => command.toJSON());


// ========================================
// READY EVENT
// ========================================

client.once('ready', async () => {

  console.log(`✅ Logged in as ${client.user.tag}`);

  try {

    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log('✅ Slash commands registered.');

  } catch (err) {

    console.error('❌ Failed during startup:', err);
  }
});


// ========================================
// INTERACTIONS
// ========================================

client.on('interactionCreate', async interaction => {

  try {

    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply();

    const userId = interaction.user.id;

    // ====================================
    // /ADD
    // ====================================

    if (interaction.commandName === 'add') {

      const link = interaction.options.getString('link');

      const existingUser = await linksCollection.findOne({
        userId: userId
      });

      // DUPLICATE PREVENTION
      if (
        existingUser &&
        existingUser.links.includes(link)
      ) {

        return interaction.editReply({
          content: 'You already saved this link.'
        });
      }

      await linksCollection.updateOne(
        { userId: userId },
        {
          $push: {
            links: link
          }
        },
        {
          upsert: true
        }
      );

      const updatedUser = await linksCollection.findOne({
        userId: userId
      });

      return interaction.editReply({
        content:
          `Link saved successfully\n` +
          `Links saved: ${updatedUser.links.length}`
      });
    }


    // ====================================
    // /GET
    // ====================================

    if (interaction.commandName === 'get') {

      const userData = await linksCollection.findOne({
        userId: userId
      });

      if (!userData || !userData.links || userData.links.length === 0) {

        return interaction.editReply({
          content: 'You have no links saved'
        });
      }

      // RANDOM ITEM
      const randomIndex =
        Math.floor(Math.random() * userData.links.length);

      const selectedLink =
        userData.links[randomIndex];

      // REMOVE ITEM FOREVER
      userData.links.splice(randomIndex, 1);

      await linksCollection.updateOne(
        { userId: userId },
        {
          $set: {
            links: userData.links
          }
        }
      );

      let message =
        `Here's one of your saved links:\n\n` +
        `${selectedLink}\n\n`;

      if (userData.links.length === 0) {

        message += '(This was your last saved link)';

      } else {

        message +=
          `Links remaining: ${userData.links.length}`;
      }

      // CHECK IF IT IS A VALID URL
      const isValidUrl =
        typeof selectedLink === 'string' &&
        (
          selectedLink.startsWith('http://') ||
          selectedLink.startsWith('https://')
        );

      // IF URL -> SHOW BUTTON
      if (isValidUrl) {

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Open link')
              .setStyle(ButtonStyle.Link)
              .setURL(selectedLink)
          );

        return interaction.editReply({
          content: message,
          components: [row]
        });
      }

      // IF NOT URL -> NO BUTTON
      return interaction.editReply({
        content: message
      });
    }


    // ====================================
    // /COUNT
    // ====================================

    if (interaction.commandName === 'count') {

      const userData = await linksCollection.findOne({
        userId: userId
      });

      const count =
        userData && userData.links
          ? userData.links.length
          : 0;

      return interaction.editReply({
        content: `You have ${count} links saved.`
      });
    }

  } catch (error) {

    console.error('❌ Interaction error:', error);

    try {

      if (interaction.deferred || interaction.replied) {

        await interaction.editReply({
          content: 'Something went wrong while processing your request.'
        });

      } else {

        await interaction.reply({
          content: 'Something went wrong while processing your request.',
          ephemeral: true
        });
      }

    } catch (err) {

      console.error('❌ Failed to send error reply:', err);
    }
  }
});


// ========================================
// CLIENT ERRORS
// ========================================

client.on('error', error => {
  console.error('❌ Discord client error:', error);
});

client.on('warn', warning => {
  console.warn('⚠️ Discord warning:', warning);
});


// ========================================
// STARTUP
// ========================================

async function startBot() {

  try {

    console.log('🔄 Connecting to MongoDB...');

    await mongoClient.connect();

    console.log('✅ Connected to MongoDB');

    const database = mongoClient.db('linkbot');

    linksCollection = database.collection('links');

    console.log('🔄 Logging into Discord...');

    await client.login(process.env.DISCORD_TOKEN);

  } catch (error) {

    console.error('❌ Failed during startup:', error);

    // Retry after 10 seconds
    console.log('🔄 Retrying startup in 10 seconds...');

    setTimeout(startBot, 10000);
  }
}

startBot();
