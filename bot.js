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


// ========================================
// CLIENT SETUP
// ========================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});


// ========================================
// KEEPALIVE SERVER
// ========================================

http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000);


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

    // REGISTER SLASH COMMANDS
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

        return interaction.reply({
          content: 'You already saved this link.',
          ephemeral: true
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

      return interaction.reply({
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

      if (!userData || userData.links.length === 0) {

        return interaction.reply({
          content: 'You have no links saved'
        });
      }

      // RANDOM LINK
      const randomIndex =
        Math.floor(Math.random() * userData.links.length);

      const selectedLink =
        userData.links[randomIndex];

      // REMOVE LINK FOREVER
      userData.links.splice(randomIndex, 1);

      await linksCollection.updateOne(
        { userId: userId },
        {
          $set: {
            links: userData.links
          }
        }
      );

      // BUTTON
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Open link')
            .setStyle(ButtonStyle.Link)
            .setURL(selectedLink)
        );

      let message =
        `Here's one of your saved links:\n\n` +
        `${selectedLink}\n\n`;

      if (userData.links.length === 0) {

        message += '(This was your last saved link)';
      }
      else {

        message +=
          `Links remaining: ${userData.links.length}`;
      }

      return interaction.reply({
        content: message,
        components: [row]
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
        userData
          ? userData.links.length
          : 0;

      return interaction.reply({
        content: `You have ${count} links saved.`
      });
    }

  } catch (error) {

    console.error('❌ Interaction error:', error);

    // Prevent Discord timeout message
    if (!interaction.replied && !interaction.deferred) {

      await interaction.reply({
        content: 'Something went wrong while processing your request.',
        ephemeral: true
      });
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

    await mongoClient.connect();

    console.log('✅ Connected to MongoDB');

    const database = mongoClient.db('linkbot');

    linksCollection = database.collection('links');

    await client.login(process.env.DISCORD_TOKEN);

  } catch (error) {

    console.error('❌ Failed during startup:', error);
  }
}

startBot();
