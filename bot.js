require('dotenv').config();

const fs = require('fs');
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

const DATABASE_FILE = './videos.json';


// ========================================
// DATABASE FUNCTIONS
// ========================================

function loadDatabase() {

  if (!fs.existsSync(DATABASE_FILE)) {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify({}));
  }

  return JSON.parse(fs.readFileSync(DATABASE_FILE));
}

function saveDatabase(data) {
  fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
}

function getUserVideos(userId) {

  const db = loadDatabase();

  if (!db[userId]) {
    db[userId] = [];
    saveDatabase(db);
  }

  return db[userId];
}


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
    .setDescription('Add a Pokemon pack opening video')
    .addStringOption(option =>
      option
        .setName('link')
        .setDescription('Video link')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('get')
    .setDescription('Get a random unused video'),

  new SlashCommandBuilder()
    .setName('count')
    .setDescription('Check how many videos you have left')

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
    console.error('❌ Failed to register commands:', err);
  }
});


// ========================================
// INTERACTIONS
// ========================================

client.on('interactionCreate', async interaction => {

  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  // ====================================
  // /ADD
  // ====================================

  if (interaction.commandName === 'add') {

    const link = interaction.options.getString('link');

    const db = loadDatabase();

    if (!db[userId]) {
      db[userId] = [];
    }

    // DUPLICATE PREVENTION
    if (db[userId].includes(link)) {

      return interaction.reply({
        content: '⚠️ You already saved this video.',
        ephemeral: true
      });
    }

    db[userId].push(link);

    saveDatabase(db);

    return interaction.reply({
      content:
        `✅ Video added successfully!\n` +
        `📦 Videos saved: ${db[userId].length}`
    });
  }


  // ====================================
  // /GET
  // ====================================

  if (interaction.commandName === 'get') {

    const db = loadDatabase();

    if (!db[userId] || db[userId].length === 0) {

      return interaction.reply({
        content: '⚠️ You have no videos saved!'
      });
    }

    // RANDOM VIDEO
    const randomIndex =
      Math.floor(Math.random() * db[userId].length);

    const selectedVideo = db[userId][randomIndex];

    // REMOVE VIDEO FOREVER
    db[userId].splice(randomIndex, 1);

    saveDatabase(db);

    // BUTTON
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Open Video')
          .setStyle(ButtonStyle.Link)
          .setURL(selectedVideo)
      );

    let message =
      `🎴 Tonight's Pokemon pack opening:\n\n` +
      `${selectedVideo}\n\n`;

    if (db[userId].length === 0) {

      message += '⚠️ THIS WAS YOUR LAST VIDEO!';
    }
    else {

      message +=
        `📦 Videos remaining: ${db[userId].length}`;
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

    const db = loadDatabase();

    const count = db[userId]
      ? db[userId].length
      : 0;

    return interaction.reply({
      content: `📦 You have ${count} videos saved.`
    });
  }

});


// ========================================
// LOGIN
// ========================================

client.login(process.env.DISCORD_TOKEN);
