require('dotenv').config();

const { MongoClient } = require('mongodb');
const http = require('http');
const https = require('https');
const moment = require('moment-timezone');
const { google } = require('googleapis');
const {
  Client, GatewayIntentBits, SlashCommandBuilder, Routes,
  REST, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} = require('discord.js');

// ========================================
// CONFIGURACIÓN
// ========================================
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

const ROUTINE_CHANNEL_ID = process.env.ROUTINE_CHANNEL_ID || '1515018972766928946';
const LAURA_USER_ID = process.env.LAURA_USER_ID || '808865358659584011';
const MARIO_USER_ID = process.env.MARIO_USER_ID || '883166860407869510';
const AUTHORIZED_USERS = new Set([LAURA_USER_ID, MARIO_USER_ID]);

const rawWeatherIntervalMinutes = Number(process.env.WEATHER_INTERVAL_MINUTES || 60);
const WEATHER_INTERVAL_MINUTES = Number.isFinite(rawWeatherIntervalMinutes) && rawWeatherIntervalMinutes > 0 ? rawWeatherIntervalMinutes : 60;
const ROUTINE_REMINDERS_ENABLED = String(process.env.ROUTINE_REMINDERS_ENABLED || 'true').toLowerCase() === 'true';

const ROUTINE_CONFIGS = [
  {
    key: 'laura', displayName: 'Laura', displayTitle: 'Laura 💗', heart: '💗', reminderColor: 0xcc2a80,
    forecastQuery: '-31.4201,-64.1888', weatherLabel: 'Córdoba', diarySheetName: 'Diario Laura',
    sheetName: 'Bot Laura', userId: LAURA_USER_ID, timezone: 'America/Argentina/Cordoba', dailySummaryTime: '11:00'
  },
  {
    key: 'mario', displayName: 'Mario', displayTitle: 'Mario 💚', heart: '💚', reminderColor: 0x3eb3b1,
    forecastQuery: '14.6417,-90.5133', weatherLabel: 'Ciudad de Guatemala', diarySheetName: 'Diario Mario',
    sheetName: 'Bot Mario', userId: MARIO_USER_ID, timezone: 'America/Guatemala', dailySummaryTime: '08:00'
  }
];

// ========================================
// DEBUG & LOGGING GLOBAL
// ========================================
let routineCheckCounter = 0;

function timestamp() {
  return moment().tz('America/Argentina/Cordoba').format('YYYY-MM-DD HH:mm:ss.SSS');
}

function createRoutineCheckId() {
  routineCheckCounter += 1;
  return routineCheckCounter;
}

function log(checkId, scope, message) {
  console.log(`[${timestamp()}] [CHECK #${checkId}] [${scope}] ${message}`);
}

function logError(checkId, scope, message, error) {
  console.error(`[${timestamp()}] [CHECK #${checkId}] [${scope}] ${message}`, error);
}

async function measureStep(checkId, scope, step, callback) {
  const started = Date.now();
  console.log(`[${timestamp()}] [CHECK #${checkId}] [${scope}] ▶ START ${step}`);
  try {
    const result = await callback();
    console.log(`[${timestamp()}] [CHECK #${checkId}] [${scope}] ✔ END ${step} (${Date.now() - started} ms)`);
    return result;
  } catch (error) {
    logError(checkId, scope, `FAILED ${step}`, error);
    throw error;
  }
}

// ========================================
// MONGODB & GOOGLE SHEETS
// ========================================
const mongoClient = new MongoClient(process.env.MONGODB_URI);
let linksCollection;
let routineSentCollection;
let sheetsClient;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const missing = [];
  if (!GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID');
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  if (!GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY');

  if (missing.length > 0) throw new Error('Missing Google Sheets environment variables: ' + missing.join(', '));

  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// ========================================
// MANEJO DE ERRORES GLOBALES
// ========================================
process.on('unhandledRejection', error => console.error('❌ Unhandled promise rejection:', error));
process.on('uncaughtException', error => console.error('❌ Uncaught exception:', error));
process.on('uncaughtExceptionMonitor', error => console.error('❌ Uncaught exception monitor:', error));
process.on('warning', warning => console.warn('⚠️ Node warning:', warning));

const shutdown = async (signal) => {
  console.log(`⚠️ Bot shutting down (${signal})`);
  try {
    await mongoClient.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error while closing MongoDB:', error);
  }
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ========================================
// CLIENTE DISCORD & EVENTOS
// ========================================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('disconnect', event => console.warn('⚠️ Discord disconnected:', event));
client.on('reconnecting', () => console.log('🔄 Discord reconnecting...'));
client.on('resume', replayed => console.log(`✅ Discord resumed (${replayed} events replayed)`));
client.on('shardError', error => console.error('❌ WebSocket shard error:', error));
client.on('invalidated', () => console.error('❌ Discord session invalidated'));
client.on('error', error => console.error('❌ Discord client error:', error));
client.on('warn', warning => console.warn('⚠️ Discord warning:', warning));

// ========================================
// SERVIDOR KEEPALIVE
// ========================================
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is awake!');
}).listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Keepalive server running on port ${process.env.PORT || 3000}`);
});

// ========================================
// COMANDOS SLASH
// ========================================
const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Save a link (use /get to randomly receive one of your saved links)')
    .addStringOption(option => option.setName('link').setDescription('The link you want to save for later').setRequired(true)),
  new SlashCommandBuilder().setName('get').setDescription('Get a random saved link'),
  new SlashCommandBuilder().setName('count').setDescription('Check how many links you have left'),
  new SlashCommandBuilder().setName('weather').setDescription('Update weather in Google Sheets'),
  new SlashCommandBuilder().setName('routine').setDescription('Read today’s routine from Google Sheets')
].map(command => command.toJSON());

// ========================================
// UTILIDADES
// ========================================
function trimDiscordMessage(message, maxLength = 1900) {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength - 20) + '\n\n...';
}

function normalizeTime(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  const match = text.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return text;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function isSendEnabled(value) {
  if (value === undefined || value === null || value === '') return true;
  const text = String(value).trim().toLowerCase();
  return !['false', 'falso', 'no', '0'].includes(text);
}

function getFormattedRoutineActivity(row) {
  const activity = String(row.activity || '').trim();
  if (!activity) return '';
  const embeddedTimeMatch = activity.match(/^(\d{1,2}:\d{2})\s*[•|]\s*(.+)$/s);
  if (embeddedTimeMatch) return `${normalizeTime(embeddedTimeMatch[1])} • ${embeddedTimeMatch[2].trim()}`;
  if (row.time) return `${row.time} • ${activity}`;
  return activity;
}

function getRoutineTriggerTime(row) {
  const activity = String(row.activity || '').trim();
  const embeddedTimeMatch = activity.match(/^(\d{1,2}:\d{2})\s*[•|]\s*(.+)$/s);
  if (embeddedTimeMatch) return normalizeTime(embeddedTimeMatch[1]);
  return normalizeTime(row.time);
}

function formatSpecialReminder(part) {
  const cleaned = String(part || '').trim().replace(/^•+\s*/, '').replace(/\s*•+$/, '').trim();
  return cleaned ? `• ${cleaned} •` : '';
}

function getSpecialReminderLines(activity) {
  return String(activity || '').split('\n').map(formatSpecialReminder).filter(Boolean);
}

function getSpanishWeekday(momentDate) {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return days[momentDate.day()];
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Kotori-Discord-Bot-Agenda/1.0' } }, response => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode, body: JSON.parse(body) });
        } catch (error) {
          reject(new Error('Could not parse JSON response: ' + error.message));
        }
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error('Request timeout')));
    request.on('error', reject);
  });
}

// ========================================
// CLIMA (WEATHER API)
// ========================================
let weatherUpdateRunning = false;
let weatherSchedulerStarted = false;

async function getWeatherFromWeatherApi(query, cityLabel) {
  if (!WEATHER_API_KEY) return { ok: false, text: '', error: `${cityLabel} - falta WEATHER_API_KEY` };
  const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${query}&aqi=no&lang=es`;
  try {
    const response = await fetchJson(url);
    if (response.statusCode !== 200) {
      const apiMessage = response.body?.error?.message ? ` - ${response.body.error.message}` : '';
      return { ok: false, text: '', error: `${cityLabel} - Código HTTP ${response.statusCode}${apiMessage}` };
    }
    const data = response.body;
    if (!data.current) return { ok: false, text: '', error: `${cityLabel} - respuesta inválida` };
    return { ok: true, text: `${cityLabel}: ${data.current.temp_c}°C · ${data.current.condition?.text || 'Clima variable'}`, error: '' };
  } catch (error) {
    return { ok: false, text: '', error: `${cityLabel} - ${error.message}` };
  }
}

async function getDailyForecastFromWeatherApi(query, cityLabel) {
  if (!WEATHER_API_KEY) return { ok: false, text: '', error: `${cityLabel} - falta WEATHER_API_KEY` };
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${query}&days=1&aqi=no&alerts=no&lang=es`;
  try {
    const response = await fetchJson(url);
    if (response.statusCode !== 200) return { ok: false, text: '', error: `${cityLabel} - Código HTTP ${response.statusCode}` };
    const day = response.body?.forecast?.forecastday?.[0]?.day;
    if (!day) return { ok: false, text: '', error: `${cityLabel} - respuesta sin pronóstico` };
    return {
      ok: true,
      text: `**Clima para hoy en ${cityLabel}**\nMínima: ${Math.round(day.mintemp_c)}°C • Máxima: ${Math.round(day.maxtemp_c)}°C\n${day.condition?.text || 'Clima variable'} • ${Number(day.daily_chance_of_rain || 0)}% de probabilidad de lluvia`,
      error: ''
    };
  } catch (error) {
    return { ok: false, text: '', error: `${cityLabel} - ${error.message}` };
  }
}

async function updateWeatherInSheet(reason = 'scheduled') {
  if (weatherUpdateRunning) return { skipped: true, message: 'Weather update already running.' };
  weatherUpdateRunning = true;
  try {
    const sheets = getSheetsClient();
    console.log(`🌦️ Updating weather (${reason})`);
    
    const cordoba = await getWeatherFromWeatherApi('-31.4201,-64.1888', 'Córdoba');
    const guatemala = await getWeatherFromWeatherApi('14.6417,-90.5133', 'Ciudad de Guatemala');
    const nowText = moment().tz('America/Argentina/Cordoba').format('DD/MM/YYYY HH:mm');

    const data = [
      { range: "'Guía'!Z1", values: [[`Último intento Render: ${nowText}`]] },
      { range: "'Guía'!Z2", values: [[cordoba.ok ? 'Córdoba OK' : cordoba.error]] },
      { range: "'Guía'!Z3", values: [[guatemala.ok ? 'Guatemala OK' : guatemala.error]] },
      { range: "'Guía'!Z4", values: [[`Origen: Render WeatherAPI (${reason})`]] }
    ];

    if (cordoba.ok) data.push({ range: "'Guía'!F3", values: [[cordoba.text]] });
    if (guatemala.ok) data.push({ range: "'Guía'!F5", values: [[guatemala.text]] });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data }
    });

    console.log('✅ Weather update finished.');
    return { skipped: false, cordoba, guatemala };
  } finally {
    weatherUpdateRunning = false;
  }
}

function startWeatherScheduler() {
  if (weatherSchedulerStarted) return;
  weatherSchedulerStarted = true;
  console.log(`🌦️ Weather scheduler enabled (${WEATHER_INTERVAL_MINUTES} min)`);
  setTimeout(() => updateWeatherInSheet('startup').catch(err => console.error('❌ Weather startup failed:', err)), 5000);
  setInterval(() => updateWeatherInSheet('scheduled').catch(err => console.error('❌ Scheduled weather update failed:', err)), WEATHER_INTERVAL_MINUTES * 60 * 1000);
}

// ========================================
// LEER DE GOOGLE SHEETS
// ========================================
async function readRoutineRows(config) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID, range: `'${config.sheetName}'!A2:E`, valueRenderOption: 'FORMATTED_VALUE'
  });
  const rows = [];
  for (const row of response.data.values || []) {
    if (!isSendEnabled(row[4])) continue;
    const activities = String(row[2] || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    for (const activity of activities) {
      rows.push({ date: row[0] || '', time: normalizeTime(row[1] || ''), activity, type: String(row[3] || '').trim().toLowerCase(), sendEnabled: true });
    }
  }
  return rows.filter(row => row.activity);
}

async function readDailyNote(config) {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: `'${config.diarySheetName}'!G6`, valueRenderOption: 'FORMATTED_VALUE' });
    const values = response.data.values || [];
    return values[0]?.[0] ? String(values[0][0]).trim() : '';
  } catch (error) {
    console.error(`❌ Could not read notes for ${config.displayName}:`, error);
    return '';
  }
}

async function readAutoReminders(config) {
  try {
    const sheets = getSheetsClient();
    const range = config.key === 'laura' ? "'Recordatorios'!E7:F11" : "'Recordatorios'!B7:C11";
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range, valueRenderOption: 'FORMATTED_VALUE' });
    return (response.data.values || []).map((row, index) => ({
      rowNumber: 7 + index, time: normalizeTime(row[0] || ''), activity: String(row[1] || '').trim()
    })).filter(row => row.time && row.activity);
  } catch (error) {
    console.error(`❌ Could not read auto reminders for ${config.displayName}:`, error);
    return [];
  }
}

async function clearAutoReminder(config, rowNumber) {
  try {
    const sheets = getSheetsClient();
    const range = config.key === 'laura' ? `'Recordatorios'!E${rowNumber}:F${rowNumber}` : `'Recordatorios'!B${rowNumber}:C${rowNumber}`;
    await sheets.spreadsheets.values.clear({ spreadsheetId: GOOGLE_SHEET_ID, range });
  } catch (error) {
    console.error(`❌ Could not clear auto reminder for ${config.displayName}:`, error);
  }
}

async function readPatyReminders() {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: GOOGLE_SHEET_ID, range: "'Paty Viena'!B3:E", valueRenderOption: 'FORMATTED_VALUE' });
  return (response.data.values || []).map(row => ({
    time: normalizeTime(row[0] || ''), activity: String(row[1] || '').trim(), date: String(row[3] || '').trim()
  })).filter(row => row.time && row.activity && row.date);
}

// ========================================
// CONSTRUCCIÓN DE MENSAJES DE RUTINA
// ========================================
function buildRoutineDisplay(config, rows) {
  const scheduledRows = rows.filter(row => row.type === 'horario');
  const specialRows = rows.filter(row => row.type === 'especial');
  const lines = [`**${config.displayTitle}**`, '**Actividades de hoy**'];
  
  if (scheduledRows.length === 0) lines.push('No hay actividades con horario.');
  else scheduledRows.forEach(row => lines.push(getFormattedRoutineActivity(row)));

  if (specialRows.length > 0) {
    lines.push('', '**Recordatorios especiales**');
    specialRows.forEach(row => lines.push(...getSpecialReminderLines(row.activity)));
  }
  return lines.join('\n');
}

function buildManualRoutineMessage(sections) {
  return trimDiscordMessage(sections.join('\n\n'));
}

function buildDailyRoutineSummary(config, rows, note, forecast) {
  const scheduledRows = rows.filter(row => row.type === 'horario');
  const specialRows = rows.filter(row => row.type === 'especial');
  const lines = ['**Actividades de hoy**'];

  if (scheduledRows.length === 0) lines.push('No hay actividades con horario.');
  else scheduledRows.forEach(row => lines.push(getFormattedRoutineActivity(row)));

  if (specialRows.length > 0) {
    lines.push('', '**Recordatorios especiales**');
    specialRows.forEach(row => lines.push(...getSpecialReminderLines(row.activity)));
  }
  if (note) lines.push('', '**Notas**', note);
  if (forecast.ok) lines.push('', forecast.text);

  return new EmbedBuilder().setColor(config.reminderColor).setDescription(lines.join('\n'));
}

// ========================================
// BASE DE DATOS Y ENVÍO DE RUTINAS
// ========================================
async function getRoutineChannel() {
  const channel = await client.channels.fetch(ROUTINE_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) throw new Error('Routine channel not found or is not text based.');
  return channel;
}

async function wasRoutineSent(key) {
  if (!routineSentCollection) return false;
  return Boolean(await routineSentCollection.findOne({ key }));
}

async function markRoutineSent(key) {
  if (!routineSentCollection) return;
  await routineSentCollection.updateOne({ key }, { $setOnInsert: { key, sentAt: new Date() } }, { upsert: true });
}

// ========================================
// FUNCIONES DE ENVÍO ESPECÍFICO
// ========================================
async function sendDailySummaryIfNeeded(checkId, config, channel) {
  const scope = `${config.displayName} Summary`;
  const now = moment().tz(config.timezone);
  const currentTime = now.format('HH:mm');
  if (currentTime !== config.dailySummaryTime) return;

  const sentKey = `${config.key}:${now.format('YYYY-MM-DD')}:daily-summary`;
  if (await wasRoutineSent(sentKey)) return log(checkId, scope, 'Already sent.');

  const rows = await measureStep(checkId, scope, 'Read routine rows', () => readRoutineRows(config));
  const note = await measureStep(checkId, scope, 'Read diary', () => readDailyNote(config));
  const forecast = await measureStep(checkId, scope, 'Read weather', () => getDailyForecastFromWeatherApi(config.forecastQuery, config.weatherLabel));
  const embed = buildDailyRoutineSummary(config, rows, note, forecast);

  await measureStep(checkId, scope, 'Discord send', () => channel.send({ content: `Feliz ${getSpanishWeekday(now)} <@${config.userId}> ${config.heart}`, embeds: [embed] }));
  await measureStep(checkId, scope, 'Mark sent', () => markRoutineSent(sentKey));
}

async function sendTimedRemindersIfNeeded(checkId, config, channel) {
  const scope = `${config.displayName} Reminders`;
  const now = moment().tz(config.timezone);
  const currentTime = now.format('HH:mm');
  const dateKey = now.format('YYYY-MM-DD');

  const rows = await measureStep(checkId, scope, 'Read routine', () => readRoutineRows(config));
  const dueRows = rows.filter(row => row.type === 'horario' && getRoutineTriggerTime(row) === currentTime);

  if (dueRows.length === 0) return;

  for (const row of dueRows) {
    const triggerTime = getRoutineTriggerTime(row);
    const sentKey = `${config.key}:${dateKey}:reminder:${triggerTime}:${row.activity}`;
    if (await measureStep(checkId, `${scope} (${triggerTime})`, 'Check database', () => wasRoutineSent(sentKey))) continue;

    const formattedActivity = getFormattedRoutineActivity(row);
    const embed = new EmbedBuilder().setColor(config.reminderColor).setTitle('Recordatorio').setDescription(formattedActivity);
    
    await measureStep(checkId, `${scope} (${triggerTime})`, 'Discord send', () => channel.send({ content: `<@${config.userId}> | ${formattedActivity}`, embeds: [embed] }));
    await measureStep(checkId, `${scope} (${triggerTime})`, 'Mark sent', () => markRoutineSent(sentKey));
  }
}

async function sendAutoRemindersIfNeeded(checkId, config, channel) {
  const scope = `${config.displayName} Auto`;
  const now = moment().tz(config.timezone);
  const currentTime = now.format('HH:mm');
  
  const reminders = await measureStep(checkId, scope, 'Read auto reminders', () => readAutoReminders(config));
  const dueReminders = reminders.filter(r => r.time === currentTime);

  for (const reminder of dueReminders) {
    const sentKey = `${config.key}:${now.format('YYYY-MM-DD')}:auto:${reminder.time}:${reminder.activity}`;
    if (await measureStep(checkId, `${scope} (${reminder.time})`, 'Check db', () => wasRoutineSent(sentKey))) continue;

    const embed = new EmbedBuilder().setColor(config.reminderColor).setTitle('Recordatorio').setDescription(`${reminder.time} • ${reminder.activity}`);
    await measureStep(checkId, `${scope} (${reminder.time})`, 'Discord send', () => channel.send({ content: `<@${config.userId}> | ${reminder.activity}`, embeds: [embed] }));
    await measureStep(checkId, `${scope} (${reminder.time})`, 'Mark sent', () => markRoutineSent(sentKey));
    await measureStep(checkId, `${scope} (${reminder.time})`, 'Clear reminder', () => clearAutoReminder(config, reminder.rowNumber));
  }
}

async function sendPatyRemindersIfNeeded(checkId, channel) {
  const scope = 'Paty';
  const now = moment().tz('America/Argentina/Cordoba');
  const currentTime = now.format('HH:mm');
  const currentDate = now.format('DD/MM');

  const reminders = await measureStep(checkId, scope, 'Read Paty', () => readPatyReminders());
  const dueReminders = reminders.filter(r => r.time === currentTime && r.date === currentDate);

  for (const reminder of dueReminders) {
    const sentKey = `paty:${now.format('YYYY-MM-DD')}:${reminder.time}:${reminder.activity}`;
    if (await measureStep(checkId, `Paty ${reminder.time}`, 'Check db', () => wasRoutineSent(sentKey))) continue;

    const embed = new EmbedBuilder().setColor(0xcc2a80).setTitle('Agitar las gotas').setDescription(`${reminder.time} • ${reminder.activity}`);
    await measureStep(checkId, `Paty ${reminder.time}`, 'Discord send', () => channel.send({ content: `<@${LAURA_USER_ID}> | ${reminder.time} • ${reminder.activity}`, embeds: [embed] }));
    await measureStep(checkId, `Paty ${reminder.time}`, 'Mark sent', () => markRoutineSent(sentKey));
  }
}

async function sendThursdayGifIfNeeded(checkId, channel) {
  const scope = 'Thursday GIF';
  const now = moment().tz('America/Argentina/Cordoba');
  if (now.day() !== 4 || now.format('HH:mm') !== '11:00') return;

  const sentKey = `global:${now.format('YYYY-MM-DD')}:thursday-gif`;
  if (await wasRoutineSent(sentKey)) return;

  await measureStep(checkId, scope, 'Discord send', () => channel.send('https://tenor.com/view/asuka-feliz-jueves-gif-7509624986630694154'));
  await measureStep(checkId, scope, 'Mark sent', () => markRoutineSent(sentKey));
}

// ========================================
// SCHEDULER DE RUTINA
// ========================================
let routineSchedulerStarted = false;
let routineCheckRunning = false;

async function checkRoutineTasks() {
  if (!ROUTINE_REMINDERS_ENABLED || routineCheckRunning) return;
  routineCheckRunning = true;
  const checkId = createRoutineCheckId();
  const started = Date.now();
  log(checkId, 'SYSTEM', 'Routine check started.');

  try {
    const channel = await measureStep(checkId, 'SYSTEM', 'Fetch routine channel', () => getRoutineChannel());
    const tasks = [];

    for (const config of ROUTINE_CONFIGS) {
      tasks.push((async () => { try { await sendDailySummaryIfNeeded(checkId, config, channel); } catch (e) { logError(checkId, config.displayName, 'Summary failed', e); } })());
      tasks.push((async () => { try { await sendTimedRemindersIfNeeded(checkId, config, channel); } catch (e) { logError(checkId, config.displayName, 'Timed failed', e); } })());
      tasks.push((async () => { try { await sendAutoRemindersIfNeeded(checkId, config, channel); } catch (e) { logError(checkId, config.displayName, 'Auto failed', e); } })());
    }
    tasks.push((async () => { try { await sendPatyRemindersIfNeeded(checkId, channel); } catch (e) { logError(checkId, 'Paty', 'Paty failed', e); } })());
    tasks.push((async () => { try { await sendThursdayGifIfNeeded(checkId, channel); } catch (e) { logError(checkId, 'GIF', 'GIF failed', e); } })());

    log(checkId, 'SYSTEM', `Launching ${tasks.length} async task(s).`);
    await Promise.allSettled(tasks);
    log(checkId, 'SYSTEM', 'All routine tasks finished.');
  } catch (error) {
    logError(checkId, 'SYSTEM', 'Routine check failed', error);
  } finally {
    log(checkId, 'SYSTEM', `Routine check completed (${Date.now() - started} ms)`);
    routineCheckRunning = false;
  }
}

function startRoutineScheduler() {
  if (routineSchedulerStarted) return;
  routineSchedulerStarted = true;
  if (!ROUTINE_REMINDERS_ENABLED) return console.log('🕒 Routine reminders disabled.');
  console.log('🕒 Routine Scheduler Enabled');
  setTimeout(checkRoutineTasks, 5000);
  setInterval(checkRoutineTasks, 60 * 1000);
}

// ========================================
// INTERACCIONES
// ========================================
client.on('interactionCreate', async interaction => {
  const started = Date.now();
  const scope = 'Interaction';
  try {
    if (!interaction.isChatInputCommand()) return;
    log(0, scope, `${interaction.user.tag} ejecutó /${interaction.commandName}`);
    await measureStep(0, scope, 'Defer reply', () => interaction.deferReply());

    if (['routine', 'weather'].includes(interaction.commandName) && !AUTHORIZED_USERS.has(interaction.user.id)) {
      return interaction.editReply({ content: 'Este comando no está disponible.' });
    }

    if (interaction.commandName === 'add') {
      const link = interaction.options.getString('link');
      const existingUser = await measureStep(0, '/add', 'Read Mongo', () => linksCollection.findOne({ userId: interaction.user.id }));
      if (existingUser?.links?.includes(link)) return interaction.editReply({ content: 'You already saved this link.' });

      await measureStep(0, '/add', 'Update Mongo', () => linksCollection.updateOne({ userId: interaction.user.id }, { $push: { links: link } }, { upsert: true }));
      const updatedUser = await measureStep(0, '/add', 'Reload Mongo', () => linksCollection.findOne({ userId: interaction.user.id }));
      await interaction.editReply({ content: `Link saved successfully\nLinks saved: ${updatedUser?.links?.length || 0}` });
    }

    if (interaction.commandName === 'get') {
      const userData = await measureStep(0, '/get', 'Read Mongo', () => linksCollection.findOne({ userId: interaction.user.id }));
      if (!userData?.links?.length) return interaction.editReply({ content: 'You have no links saved' });

      const randomIndex = Math.floor(Math.random() * userData.links.length);
      const selectedLink = userData.links[randomIndex];
      userData.links.splice(randomIndex, 1);

      await measureStep(0, '/get', 'Update Mongo', () => linksCollection.updateOne({ userId: interaction.user.id }, { $set: { links: userData.links } }));
      
      let message = `Here's one of your saved links:\n\n${selectedLink}\n\n`;
      message += userData.links.length === 0 ? '(This was your last saved link)' : `Links remaining: ${userData.links.length}`;

      if (typeof selectedLink === 'string' && (selectedLink.startsWith('http://') || selectedLink.startsWith('https://'))) {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Open link').setStyle(ButtonStyle.Link).setURL(selectedLink));
        await interaction.editReply({ content: message, components: [row] });
      } else {
        await interaction.editReply({ content: message });
      }
    }

    if (interaction.commandName === 'count') {
      const userData = await measureStep(0, '/count', 'Read Mongo', () => linksCollection.findOne({ userId: interaction.user.id }));
      await interaction.editReply({ content: `You have ${userData?.links?.length || 0} links saved.` });
    }

    if (interaction.commandName === 'weather') {
      const result = await measureStep(0, '/weather', 'Update', () => updateWeatherInSheet('slash command'));
      if (result.skipped) return interaction.editReply({ content: 'Actualización en curso. Omitiendo.' });
      const lines = ['**Clima actualizado**', '', result.cordoba.ok ? `✅ ${result.cordoba.text}` : `⚠️ ${result.cordoba.error}`, result.guatemala.ok ? `✅ ${result.guatemala.text}` : `⚠️ ${result.guatemala.error}`];
      await interaction.editReply({ content: trimDiscordMessage(lines.join('\n')) });
    }

    if (interaction.commandName === 'routine') {
      const sections = [];
      await measureStep(0, '/routine', 'Read routines', async () => {
        for (const config of ROUTINE_CONFIGS) sections.push(buildRoutineDisplay(config, await readRoutineRows(config)));
      });
      await interaction.editReply({ content: buildManualRoutineMessage(sections) });
    }
    
    log(0, `/${interaction.commandName}`, `Finished (${Date.now() - started} ms)`);
  } catch (error) {
    logError(0, 'Interaction', `Command failed`, error);
    const msg = 'Something went wrong. Check Render logs.';
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg }).catch(e => console.error(e));
    else await interaction.reply({ content: msg, ephemeral: true }).catch(e => console.error(e));
  }
});

// ========================================
// STARTUP Y READY
// ========================================
async function startBot() {
  log(0, 'STARTUP', 'Starting bot...');
  try {
    await measureStep(0, 'MongoDB', 'Connect', () => mongoClient.connect());
    const db = mongoClient.db('linkbot');
    linksCollection = db.collection('links');
    routineSentCollection = db.collection('routineSent');
    
    await measureStep(0, 'Discord', 'Login', () => client.login(process.env.DISCORD_TOKEN));
  } catch (error) {
    logError(0, 'STARTUP', 'Startup failed', error);
    setTimeout(startBot, 10000);
  }
}

client.once('ready', async () => {
  const readyId = createRoutineCheckId();
  log(readyId, 'READY', `Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await measureStep(readyId, 'SlashCommands', 'Register', () => rest.put(Routes.applicationCommands(client.user.id), { body: commands }));
    startWeatherScheduler();
    startRoutineScheduler();
    log(readyId, 'READY', 'Schedulers started successfully');
  } catch (error) {
    logError(readyId, 'READY', 'Initialization failed', error);
  }
});

startBot();
