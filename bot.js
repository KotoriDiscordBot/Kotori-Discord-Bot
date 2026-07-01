require('dotenv').config();

const { MongoClient } = require('mongodb');
const http = require('http');
const https = require('https');
const moment = require('moment-timezone');
const { google } = require('googleapis');

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');


// ========================================
// CONFIG
// ========================================

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY
  ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : null;

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

const ROUTINE_CHANNEL_ID =
  process.env.ROUTINE_CHANNEL_ID || '1515018972766928946';

const LAURA_USER_ID =
  process.env.LAURA_USER_ID || '808865358659584011';

const MARIO_USER_ID =
  process.env.MARIO_USER_ID || '883166860407869510';

const AUTHORIZED_USERS = new Set([
  LAURA_USER_ID,
  MARIO_USER_ID
]);

const rawWeatherIntervalMinutes =
  Number(process.env.WEATHER_INTERVAL_MINUTES || 60);

const WEATHER_INTERVAL_MINUTES =
  Number.isFinite(rawWeatherIntervalMinutes) && rawWeatherIntervalMinutes > 0
    ? rawWeatherIntervalMinutes
    : 60;

// Está activado por defecto.
// Para pausarlo, usar en Render:
// ROUTINE_REMINDERS_ENABLED=false
const ROUTINE_REMINDERS_ENABLED =
  String(process.env.ROUTINE_REMINDERS_ENABLED || 'true').toLowerCase() === 'true';

const ROUTINE_CONFIGS = [
  {
    key: 'laura',
    displayName: 'Laura',
    displayTitle: 'Laura 💗',
    heart: '💗',
    reminderColor: 0xcc2a80,
    forecastQuery: '-31.4201,-64.1888',
    weatherLabel: 'Córdoba',
    diarySheetName: 'Diario Laura',
    sheetName: 'Bot Laura',
    userId: LAURA_USER_ID,
    timezone: 'America/Argentina/Cordoba',
    dailySummaryTime: '11:00'
  },
  {
    key: 'mario',
    displayName: 'Mario',
    displayTitle: 'Mario 💚',
    heart: '💚',
    reminderColor: 0x3eb3b1,
    forecastQuery: '14.6417,-90.5133',
    weatherLabel: 'Ciudad de Guatemala',
    diarySheetName: 'Diario Mario',
    sheetName: 'Bot Mario',
    userId: MARIO_USER_ID,
    timezone: 'America/Guatemala',
    dailySummaryTime: '08:00'
  }
];


// ========================================
// MONGODB
// ========================================

const mongoClient = new MongoClient(process.env.MONGODB_URI);

let linksCollection;
let routineSentCollection;


// ========================================
// GOOGLE SHEETS
// ========================================

let sheetsClient;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const missing = [];

  if (!GOOGLE_SHEET_ID) {
    missing.push('GOOGLE_SHEET_ID');
  }

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  }

  if (!GOOGLE_PRIVATE_KEY) {
    missing.push('GOOGLE_PRIVATE_KEY');
  }

  if (missing.length > 0) {
    throw new Error(
      'Missing Google Sheets environment variables: ' + missing.join(', ')
    );
  }

  const auth = new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  sheetsClient = google.sheets({
    version: 'v4',
    auth
  });

  return sheetsClient;
}


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
  } catch (error) {
    console.error('❌ Error while closing MongoDB:', error);
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('⚠️ Bot shutting down (SIGTERM)');

  try {
    await mongoClient.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error while closing MongoDB:', error);
  }

  process.exit(0);
});


// ========================================
// CLIENT SETUP
// ========================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});
client.on('ready', () => {
  console.log('READY EVENT DISPARADO');
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
  console.log(
    `🌐 Keepalive server running on port ${process.env.PORT || 3000}`
  );
});


// ========================================
// SLASH COMMANDS
// ========================================

const commands = [
  new SlashCommandBuilder()
    .setName('add')
    .setDescription(
      'Save a link (use /get to randomly receive one of your saved links)'
    )
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
    .setDescription('Check how many links you have left'),

  new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Update weather in Google Sheets'),

  new SlashCommandBuilder()
    .setName('routine')
    .setDescription('Read today’s routine from Google Sheets')
].map(command => command.toJSON());


// ========================================
// SMALL HELPERS
// ========================================

function trimDiscordMessage(message, maxLength = 1900) {
  if (message.length <= maxLength) {
    return message;
  }

  return message.slice(0, maxLength - 20) + '\n\n...';
}

function normalizeTime(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value).trim();
  const match = text.match(/(\d{1,2})[:.](\d{2})/);

  if (!match) {
    return text;
  }

  const hour = match[1].padStart(2, '0');
  const minute = match[2];

  return `${hour}:${minute}`;
}

function isSendEnabled(value) {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  const text = String(value).trim().toLowerCase();

  return ![
    'false',
    'falso',
    'no',
    '0'
  ].includes(text);
}

/*
 * Si la actividad ya comienza con una hora:
 *
 * 14:00 • Turno médico
 *
 * toma esa hora y evita mostrar:
 *
 * 14:00 • 14:00 • Turno médico
 *
 * También preserva una hora interna distinta:
 *
 * Hora del bloque: 15:00
 * Actividad: 15:30 • Turno médico
 * Resultado visible: 15:30 • Turno médico
 */
function getFormattedRoutineActivity(row) {
  const activity = String(row.activity || '').trim();

  if (!activity) {
    return '';
  }

  const embeddedTimeMatch = activity.match(
    /^(\d{1,2}:\d{2})\s*[•|]\s*(.+)$/s
  );

  if (embeddedTimeMatch) {
    const embeddedTime = normalizeTime(embeddedTimeMatch[1]);
    const activityText = embeddedTimeMatch[2].trim();

    return `${embeddedTime} • ${activityText}`;
  }

  if (row.time) {
    return `${row.time} • ${activity}`;
  }

  return activity;
}
function getRoutineTriggerTime(row) {
  const activity = String(row.activity || '').trim();

  const embeddedTimeMatch = activity.match(
    /^(\d{1,2}:\d{2})\s*[•|]\s*(.+)$/s
  );

  if (embeddedTimeMatch) {
    return normalizeTime(embeddedTimeMatch[1]);
  }

  return normalizeTime(row.time);
}
function formatSpecialReminder(part) {
  const cleaned = String(part || '')
    .trim()
    .replace(/^•+\s*/, '')
    .replace(/\s*•+$/, '')
    .trim();

  if (!cleaned) {
    return '';
  }

  return `• ${cleaned} •`;
}

function getSpecialReminderLines(activity) {
  return String(activity || '')
    .split('\n')
    .map(formatSpecialReminder)
    .filter(Boolean);
}

function getSpanishWeekday(momentDate) {
  const days = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado'
  ];

  return days[momentDate.day()];
}


// ========================================
// HTTPS JSON HELPER
// ========================================

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Kotori-Discord-Bot-Agenda/1.0'
        }
      },
      response => {
        let body = '';

        response.on('data', chunk => {
          body += chunk;
        });

        response.on('end', () => {
          let parsed = null;

          try {
            parsed = JSON.parse(body);
          } catch (error) {
            return reject(
              new Error(
                'Could not parse JSON response: ' + error.message
              )
            );
          }

          resolve({
            statusCode: response.statusCode,
            body: parsed
          });
        });
      }
    );

    request.setTimeout(15000, () => {
      request.destroy(new Error('Request timeout'));
    });

    request.on('error', error => {
      reject(error);
    });
  });
}


// ========================================
// WEATHER - WEATHERAPI.COM
// ========================================

let weatherUpdateRunning = false;
let weatherSchedulerStarted = false;

async function getWeatherFromWeatherApi(query, cityLabel) {
  if (!WEATHER_API_KEY) {
    return {
      ok: false,
      text: '',
      error: `${cityLabel} - falta WEATHER_API_KEY en Render`
    };
  }

  const params = new URLSearchParams({
    key: WEATHER_API_KEY,
    q: query,
    aqi: 'no',
    lang: 'es'
  });

  const url =
    'https://api.weatherapi.com/v1/current.json?' +
    params.toString();

  try {
    const response = await fetchJson(url);

    if (response.statusCode !== 200) {
      const apiMessage =
        response.body &&
        response.body.error &&
        response.body.error.message
          ? ` - ${response.body.error.message}`
          : '';

      return {
        ok: false,
        text: '',
        error:
          `${cityLabel} - Código HTTP: ` +
          `${response.statusCode}${apiMessage}`
      };
    }

    const data = response.body;

    if (!data.current) {
      return {
        ok: false,
        text: '',
        error: `${cityLabel} - respuesta sin datos actuales`
      };
    }

    const temperature = data.current.temp_c;

    const condition =
      data.current.condition &&
      data.current.condition.text
        ? data.current.condition.text
        : 'Clima variable';

    return {
      ok: true,
      text: `${cityLabel}: ${temperature}°C · ${condition}`,
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      text: '',
      error: `${cityLabel} - Error: ${error.message}`
    };
  }
}
async function getDailyForecastFromWeatherApi(query, cityLabel) {
  if (!WEATHER_API_KEY) {
    return {
      ok: false,
      text: '',
      error: `${cityLabel} - falta WEATHER_API_KEY en Render`
    };
  }

  const params = new URLSearchParams({
    key: WEATHER_API_KEY,
    q: query,
    days: '1',
    aqi: 'no',
    alerts: 'no',
    lang: 'es'
  });

  const url =
    'https://api.weatherapi.com/v1/forecast.json?' +
    params.toString();

  try {
    const response = await fetchJson(url);

    if (response.statusCode !== 200) {
      const apiMessage =
        response.body &&
        response.body.error &&
        response.body.error.message
          ? ` - ${response.body.error.message}`
          : '';

      return {
        ok: false,
        text: '',
        error:
          `${cityLabel} - Código HTTP: ` +
          `${response.statusCode}${apiMessage}`
      };
    }

    const forecastDays =
      response.body &&
      response.body.forecast &&
      response.body.forecast.forecastday;

    if (
      !Array.isArray(forecastDays) ||
      forecastDays.length === 0 ||
      !forecastDays[0].day
    ) {
      return {
        ok: false,
        text: '',
        error: `${cityLabel} - respuesta sin pronóstico diario`
      };
    }

    const day = forecastDays[0].day;

    const minimum = Math.round(day.mintemp_c);
    const maximum = Math.round(day.maxtemp_c);

    const condition =
      day.condition && day.condition.text
        ? day.condition.text
        : 'Clima variable';

    const rainChance =
      day.daily_chance_of_rain !== undefined
        ? Number(day.daily_chance_of_rain)
        : 0;

    return {
      ok: true,
      text:
        `**Clima para hoy en ${cityLabel}**\n` +
        `Mínima: ${minimum}°C • Máxima: ${maximum}°C\n` +
        `${condition} • ${rainChance}% de probabilidad de lluvia`,
      error: ''
    };
  } catch (error) {
    return {
      ok: false,
      text: '',
      error: `${cityLabel} - Error: ${error.message}`
    };
  }
}

async function updateWeatherInSheet(reason = 'scheduled') {
  if (weatherUpdateRunning) {
    return {
      skipped: true,
      message: 'Weather update already running.'
    };
  }

  weatherUpdateRunning = true;

  try {
    const sheets = getSheetsClient();

    console.log(
      `🌦️ Updating weather in Google Sheets with WeatherAPI (${reason})...`
    );

    const cordoba = await getWeatherFromWeatherApi(
      '-31.4201,-64.1888',
      'Córdoba'
    );

    const guatemala = await getWeatherFromWeatherApi(
      '14.6417,-90.5133',
      'Ciudad de Guatemala'
    );

    const nowText = moment()
      .tz('America/Argentina/Cordoba')
      .format('DD/MM/YYYY HH:mm');

    const data = [
      {
        range: "'Guía'!Z1",
        values: [[`Último intento Render: ${nowText}`]]
      },
      {
        range: "'Guía'!Z2",
        values: [[
          cordoba.ok
            ? 'Córdoba OK'
            : cordoba.error
        ]]
      },
      {
        range: "'Guía'!Z3",
        values: [[
          guatemala.ok
            ? 'Guatemala OK'
            : guatemala.error
        ]]
      },
      {
        range: "'Guía'!Z4",
        values: [[
          `Origen: Render WeatherAPI (${reason})`
        ]]
      }
    ];

    if (cordoba.ok) {
      data.push({
        range: "'Guía'!F3",
        values: [[cordoba.text]]
      });
    }

    if (guatemala.ok) {
      data.push({
        range: "'Guía'!F5",
        values: [[guatemala.text]]
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data
      }
    });

    console.log('✅ Weather update finished.');

    console.log(
      cordoba.ok
        ? `✅ ${cordoba.text}`
        : `⚠️ ${cordoba.error}`
    );

    console.log(
      guatemala.ok
        ? `✅ ${guatemala.text}`
        : `⚠️ ${guatemala.error}`
    );

    return {
      skipped: false,
      cordoba,
      guatemala
    };
  } finally {
    weatherUpdateRunning = false;
  }
}

function startWeatherScheduler() {
  if (weatherSchedulerStarted) {
    return;
  }

  weatherSchedulerStarted = true;

  console.log(
    `🌦️ Weather scheduler enabled. ` +
    `Interval: ${WEATHER_INTERVAL_MINUTES} minutes.`
  );

  setTimeout(async () => {
    try {
      await updateWeatherInSheet('startup');
    } catch (error) {
      console.error(
        '❌ Weather startup update failed:',
        error
      );
    }
  }, 5000);

  setInterval(async () => {
    try {
      await updateWeatherInSheet('scheduled');
    } catch (error) {
      console.error(
        '❌ Scheduled weather update failed:',
        error
      );
    }
  }, WEATHER_INTERVAL_MINUTES * 60 * 1000);
}


// ========================================
// ROUTINE / AGENDA READING
// ========================================

async function readRoutineRows(config) {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `'${config.sheetName}'!A2:E`,
    valueRenderOption: 'FORMATTED_VALUE'
  });

  const values = response.data.values || [];

  const routineRows = [];

  for (const row of values) {
    const date = row[0] || '';
    const time = normalizeTime(row[1] || '');
    const type = String(row[3] || '')
      .trim()
      .toLowerCase();

    const sendEnabled = isSendEnabled(row[4]);

    if (!sendEnabled) {
      continue;
    }

    const activityLines = String(row[2] || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    for (const activity of activityLines) {
      routineRows.push({
        date,
        time,
        activity,
        type,
        sendEnabled: true
      });
    }
  }

  return routineRows.filter(
    row => row.activity
  );
}
async function readDailyNote(config) {
  try {
    const sheets = getSheetsClient();

    const response =
      await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: `'${config.diarySheetName}'!G6`,
        valueRenderOption: 'FORMATTED_VALUE'
      });

    const values = response.data.values || [];

    if (
      values.length === 0 ||
      !values[0] ||
      values[0][0] === undefined
    ) {
      return '';
    }

    return String(values[0][0]).trim();
  } catch (error) {
    console.error(
      `❌ Could not read notes for ${config.displayName}:`,
      error
    );

    return '';
  }
}
async function readAutoReminders(config) {
  try {
    const sheets = getSheetsClient();

    const startRow = 7;

    const range =
      config.key === 'laura'
        ? "'Recordatorios'!E7:F11"
        : "'Recordatorios'!B7:C11";

    const response =
      await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
        range,
        valueRenderOption: 'FORMATTED_VALUE'
      });

    const values = response.data.values || [];

    return values
      .map((row, index) => ({
        rowNumber: startRow + index,
        time: normalizeTime(row[0] || ''),
        activity: String(row[1] || '').trim()
      }))
      .filter(
        row =>
          row.time &&
          row.activity
      );

  } catch (error) {
    console.error(
      `❌ Could not read auto reminders for ${config.displayName}:`,
      error
    );

    return [];
  }
 } 
async function clearAutoReminder(
  config,
  rowNumber
) {
  try {
    const sheets = getSheetsClient();

    const range =
      config.key === 'laura'
        ? `'Recordatorios'!E${rowNumber}:F${rowNumber}`
        : `'Recordatorios'!B${rowNumber}:C${rowNumber}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId: GOOGLE_SHEET_ID,
      range
    });

  } catch (error) {
    console.error(
      `❌ Could not clear auto reminder for ${config.displayName}:`,
      error
    );
  }
}
async function readPatyReminders() {
  const sheets = getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: "'Paty Viena'!B3:E",
    valueRenderOption: 'FORMATTED_VALUE'
  });

  const values = response.data.values || [];

  return values
    .map(row => ({
      time: normalizeTime(row[0] || ''),
      activity: String(row[1] || '').trim(),
      date: String(row[3] || '').trim()
    }))
    .filter(
      row =>
        row.time &&
        row.activity &&
        row.date
    );
}
// ========================================
// /ROUTINE DISPLAY
// ========================================

function buildRoutineDisplay(config, rows) {
  const scheduledRows = rows.filter(
    row => row.type === 'horario'
  );

  const specialRows = rows.filter(
    row => row.type === 'especial'
  );

  const lines = [];

  lines.push(`**${config.displayTitle}**`);
  lines.push('**Actividades de hoy**');

  if (scheduledRows.length === 0) {
    lines.push('No hay actividades con horario.');
  } else {
    for (const row of scheduledRows) {
      lines.push(getFormattedRoutineActivity(row));
    }
  }

  if (specialRows.length > 0) {
    lines.push('');
    lines.push('**Recordatorios especiales**');

    for (const row of specialRows) {
      const specialLines =
        getSpecialReminderLines(row.activity);

      lines.push(...specialLines);
    }
  }

  return lines.join('\n');
}

function buildManualRoutineMessage(sections) {
  return trimDiscordMessage(
    sections.join('\n\n')
  );
}


// ========================================
// DAILY ROUTINE DISPLAY
// ========================================

function buildDailyRoutineSummary(
  config,
  rows,
  note,
  forecast
) {
  const scheduledRows = rows.filter(
    row => row.type === 'horario'
  );

  const specialRows = rows.filter(
    row => row.type === 'especial'
  );

  const lines = [];

  lines.push('**Actividades de hoy**');

  if (scheduledRows.length === 0) {
    lines.push('No hay actividades con horario.');
  } else {
    for (const row of scheduledRows) {
      lines.push(
        getFormattedRoutineActivity(row)
      );
    }
  }

  if (specialRows.length > 0) {
    lines.push('');
    lines.push('**Recordatorios especiales**');

    for (const row of specialRows) {
      const specialLines =
        getSpecialReminderLines(row.activity);

      lines.push(...specialLines);
    }
  }

  if (note) {
    lines.push('');
    lines.push('**Notas**');
    lines.push(note);
  }

  if (forecast.ok) {
    lines.push('');
    lines.push(forecast.text);
  }

  return new EmbedBuilder()
    .setColor(config.reminderColor)
    .setDescription(lines.join('\n'));
}

// ========================================
// ROUTINE SENDING
// ========================================

async function getRoutineChannel() {
  const channel = await client.channels.fetch(
    ROUTINE_CHANNEL_ID
  );

  if (!channel) {
    throw new Error(
      'Could not find routine channel.'
    );
  }

  if (!channel.isTextBased()) {
    throw new Error(
      'The routine channel is not text-based.'
    );
  }

  return channel;
}

async function wasRoutineSent(key) {
  if (!routineSentCollection) {
    return false;
  }

  const existing =
    await routineSentCollection.findOne({ key });

  return Boolean(existing);
}

async function markRoutineSent(key) {
  if (!routineSentCollection) {
    return;
  }

  await routineSentCollection.updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        sentAt: new Date()
      }
    },
    {
      upsert: true
    }
  );
}

async function sendDailySummaryIfNeeded(
config,
channel
) {
const now = moment().tz(config.timezone);
const currentTime = now.format('HH:mm');

if (currentTime !== config.dailySummaryTime) {
return;
}

const dateKey = now.format('YYYY-MM-DD');

const sentKey =
`${config.key}:${dateKey}:daily-summary`;

if (await wasRoutineSent(sentKey)) {
return;
}

const rows =
await readRoutineRows(config);

const note =
await readDailyNote(config);

const forecast =
await getDailyForecastFromWeatherApi(
config.forecastQuery,
config.weatherLabel
);

const weekday =
getSpanishWeekday(now);

const summaryEmbed =
buildDailyRoutineSummary(
config,
rows,
note,
forecast
);

await channel.send({
content:
`Feliz ${weekday} ` +
`<@${config.userId}> ${config.heart}`,
embeds: [summaryEmbed]
});

await markRoutineSent(sentKey);

console.log(
`✅ Daily summary sent for ${config.displayName}`
);
}
async function sendThursdayGifIfNeeded(channel) {
  const now = moment().tz(
    'America/Argentina/Cordoba'
  );

  const isThursday = now.day() === 4;
  const currentTime = now.format('HH:mm');

  if (!isThursday || currentTime !== '11:00') {
    return;
  }

  const dateKey = now.format('YYYY-MM-DD');

  const sentKey =
    `global:${dateKey}:thursday-gif`;

  if (await wasRoutineSent(sentKey)) {
    return;
  }

  await channel.send(
    'https://tenor.com/view/asuka-feliz-jueves-gif-7509624986630694154'
  );

  await markRoutineSent(sentKey);

  console.log(
    '✅ Thursday GIF sent.'
  );
}
async function sendTimedRemindersIfNeeded(
  config,
  channel
) {
  const now = moment().tz(config.timezone);
  const currentTime = now.format('HH:mm');
  
  console.log(
  `[${config.displayName}] Hora actual: ${currentTime}`
);
  
  const dateKey = now.format('YYYY-MM-DD');

  const rows = await readRoutineRows(config);
  
  for (const row of rows) {
  console.log(
    `[${config.displayName}] Actividad "${row.activity}" -> ${getRoutineTriggerTime(row)}`
  );
}

  const dueRows = rows.filter(row =>
  row.type === 'horario' &&
  getRoutineTriggerTime(row) === currentTime
);

  for (const row of dueRows) {
    console.log(
  `[${config.displayName}] Coincidencia encontrada: ${row.activity}`
);
  const triggerTime =
  getRoutineTriggerTime(row);

const sentKey =
  `${config.key}:${dateKey}:reminder:` +
  `${triggerTime}:${row.activity}`;

    if (await wasRoutineSent(sentKey)) {
      continue;
    }

const formattedActivity =
  getFormattedRoutineActivity(row);

const reminderEmbed =
  new EmbedBuilder()
    .setColor(config.reminderColor)
    .setTitle('Recordatorio')
    .setDescription(formattedActivity);

await channel.send({
  content:
    `<@${config.userId}> | ${formattedActivity}`,
  embeds: [reminderEmbed]
});

await markRoutineSent(sentKey);

console.log(
  `✅ Reminder sent for ${config.displayName}: ` +
  formattedActivity
);
  }
}
async function sendAutoRemindersIfNeeded(
  config,
  channel
) {
  const now = moment().tz(config.timezone);

  const currentTime =
    now.format('HH:mm');

  const dateKey =
    now.format('YYYY-MM-DD');

  const reminders =
    await readAutoReminders(config);

  const dueReminders =
    reminders.filter(
      reminder =>
        reminder.time === currentTime
    );

  for (const reminder of dueReminders) {

    const sentKey =
      `${config.key}:${dateKey}:auto:` +
      `${reminder.time}:${reminder.activity}`;

    if (await wasRoutineSent(sentKey)) {
      continue;
    }

    const embed =
      new EmbedBuilder()
        .setColor(config.reminderColor)
        .setTitle('Recordatorio')
        .setDescription(
          `${reminder.time} • ${reminder.activity}`
        );

    await channel.send({
      content:
        `<@${config.userId}> | ` +
        `${reminder.activity}`,
      embeds: [embed]
    });

    await markRoutineSent(sentKey);

await clearAutoReminder(
  config,
  reminder.rowNumber
);

console.log(
  `✅ Auto reminder sent for ${config.displayName}: ${reminder.activity}`
);
  }
}
async function sendPatyRemindersIfNeeded(
  channel
) {
  const now = moment().tz(
    'America/Argentina/Cordoba'
  );

  const currentTime =
    now.format('HH:mm');

  const currentDate =
    now.format('DD/MM');

  const reminders =
    await readPatyReminders();

  const dueReminders =
    reminders.filter(
      reminder =>
        reminder.time === currentTime &&
        reminder.date === currentDate
    );

  for (const reminder of dueReminders) {

    const sentKey =
      `paty:${now.format('YYYY-MM-DD')}:` +
      `${reminder.time}:${reminder.activity}`;

    if (await wasRoutineSent(sentKey)) {
      continue;
    }

    const embed =
      new EmbedBuilder()
        .setColor(0xcc2a80)
        .setTitle('Agitar las gotas')
        .setDescription(
          `${reminder.time} • ${reminder.activity}`
        );

    await channel.send({
      content:
        `<@${LAURA_USER_ID}> | ` +
        `${reminder.time} • ${reminder.activity}`,
      embeds: [embed]
    });

    await markRoutineSent(sentKey);

    console.log(
      `💊 Paty: ${reminder.time} - ${reminder.activity}`
    );
  }
}
// ========================================
// ROUTINE SCHEDULER
// ========================================

let routineSchedulerStarted = false;
let routineCheckRunning = false;
  
async function checkRoutineTasks() {
  if (!ROUTINE_REMINDERS_ENABLED) {
    return;
  }

  if (routineCheckRunning) {
    return;
  }
console.log(
  `🕒 checkRoutineTasks ejecutado: ${
    moment()
      .tz('America/Argentina/Cordoba')
      .format('YYYY-MM-DD HH:mm:ss')
  }`
);
  routineCheckRunning = true;

  try {
    const channel = await getRoutineChannel();

    // Primero envía los dos resúmenes diarios.
for (const config of ROUTINE_CONFIGS) {
  await sendDailySummaryIfNeeded(
    config,
    channel
  );
}

// Después de los resúmenes, envía el GIF
// solamente una vez los jueves.
await sendThursdayGifIfNeeded(channel);

// Finalmente revisa los recordatorios.
for (const config of ROUTINE_CONFIGS) {

  await sendTimedRemindersIfNeeded(
    config,
    channel
  );

  await sendAutoRemindersIfNeeded(
    config,
    channel
  );
}

await sendPatyRemindersIfNeeded(
  channel
);

} catch (error) {
  console.error(
    '❌ Routine check failed:',
    error
  );
} finally {
  routineCheckRunning = false;
 }
}  

function startRoutineScheduler() {
  if (routineSchedulerStarted) {
    return;
  }

  routineSchedulerStarted = true;

  if (!ROUTINE_REMINDERS_ENABLED) {
    console.log(
      '🕒 Routine reminders are disabled. ' +
      'Set ROUTINE_REMINDERS_ENABLED=true to enable them.'
    );

    return;
  }

  console.log(
    '🕒 Routine reminder scheduler enabled.'
  );

  setTimeout(
    checkRoutineTasks,
    5000
  );

  setInterval(
    checkRoutineTasks,
    60 * 1000
  );
}


// ========================================
// READY EVENT
// ========================================

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({
      version: '10'
    }).setToken(
      process.env.DISCORD_TOKEN
    );

    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: commands
      }
    );

    console.log(
      '✅ Slash commands registered.'
    );

    startWeatherScheduler();
    startRoutineScheduler();
  } catch (error) {
    console.error(
      '❌ Failed during startup:',
      error
    );
  }
});


// ========================================
// INTERACTIONS
// ========================================

client.on(
  'interactionCreate',
  async interaction => {
    try {
      if (!interaction.isChatInputCommand()) {
        return;
      }

      await interaction.deferReply();

      const userId = interaction.user.id;

      const restrictedCommands = [
        'routine',
        'weather'
      ];

      if (
        restrictedCommands.includes(
          interaction.commandName
        ) &&
        !AUTHORIZED_USERS.has(userId)
      ) {
        return interaction.editReply({
          content:
            'Este comando no está disponible.'
        });
      }


      // ==================================
      // /ADD
      // ==================================

      if (interaction.commandName === 'add') {
        const link =
          interaction.options.getString('link');

        const existingUser =
          await linksCollection.findOne({
            userId
          });

        if (
          existingUser &&
          Array.isArray(existingUser.links) &&
          existingUser.links.includes(link)
        ) {
          return interaction.editReply({
            content:
              'You already saved this link.'
          });
        }

        await linksCollection.updateOne(
          {
            userId
          },
          {
            $push: {
              links: link
            }
          },
          {
            upsert: true
          }
        );

        const updatedUser =
          await linksCollection.findOne({
            userId
          });

        const linksCount =
          updatedUser &&
          Array.isArray(updatedUser.links)
            ? updatedUser.links.length
            : 0;

        return interaction.editReply({
          content:
            `Link saved successfully\n` +
            `Links saved: ${linksCount}`
        });
      }


      // ==================================
      // /GET
      // ==================================

      if (interaction.commandName === 'get') {
        const userData =
          await linksCollection.findOne({
            userId
          });

        if (
          !userData ||
          !Array.isArray(userData.links) ||
          userData.links.length === 0
        ) {
          return interaction.editReply({
            content:
              'You have no links saved'
          });
        }

        const randomIndex =
          Math.floor(
            Math.random() *
            userData.links.length
          );

        const selectedLink =
          userData.links[randomIndex];

        userData.links.splice(
          randomIndex,
          1
        );

        await linksCollection.updateOne(
          {
            userId
          },
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
          message +=
            '(This was your last saved link)';
        } else {
          message +=
            `Links remaining: ` +
            `${userData.links.length}`;
        }

        const isValidUrl =
          typeof selectedLink === 'string' &&
          (
            selectedLink.startsWith('http://') ||
            selectedLink.startsWith('https://')
          );

        if (isValidUrl) {
          const row =
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setLabel('Open link')
                  .setStyle(
                    ButtonStyle.Link
                  )
                  .setURL(selectedLink)
              );

          return interaction.editReply({
            content: message,
            components: [row]
          });
        }

        return interaction.editReply({
          content: message
        });
      }


      // ==================================
      // /COUNT
      // ==================================

      if (interaction.commandName === 'count') {
        const userData =
          await linksCollection.findOne({
            userId
          });

        const count =
          userData &&
          Array.isArray(userData.links)
            ? userData.links.length
            : 0;

        return interaction.editReply({
          content:
            `You have ${count} links saved.`
        });
      }


      // ==================================
      // /WEATHER
      // ==================================

      if (
        interaction.commandName === 'weather'
      ) {
        const result =
          await updateWeatherInSheet(
            'slash command'
          );

        if (result.skipped) {
          return interaction.editReply({
            content:
              'La actualización del clima se omitió ' +
              'porque ya hay otra actualización en curso.'
          });
        }

        const lines = [
          '**Clima actualizado**',
          '',
          result.cordoba.ok
            ? `✅ ${result.cordoba.text}`
            : `⚠️ ${result.cordoba.error}`,
          result.guatemala.ok
            ? `✅ ${result.guatemala.text}`
            : `⚠️ ${result.guatemala.error}`
        ];

        return interaction.editReply({
          content:
            trimDiscordMessage(
              lines.join('\n')
            )
        });
      }


      // ==================================
      // /ROUTINE
      // ==================================

      if (
        interaction.commandName === 'routine'
      ) {
        const sections = [];

        for (
          const config of ROUTINE_CONFIGS
        ) {
          const rows =
            await readRoutineRows(config);

          sections.push(
            buildRoutineDisplay(
              config,
              rows
            )
          );
        }

        return interaction.editReply({
          content:
            buildManualRoutineMessage(
              sections
            )
        });
      }
    } catch (error) {
      console.error(
        '❌ Interaction error:',
        error
      );

      try {
        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction.editReply({
            content:
              'Something went wrong while processing your request.\n\n' +
              'Check the Render logs for the full error.'
          });
        } else {
          await interaction.reply({
            content:
              'Something went wrong while processing your request.\n\n' +
              'Check the Render logs for the full error.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error(
          '❌ Failed to send error reply:',
          replyError
        );
      }
    }
  }
);


// ========================================
// CLIENT ERRORS
// ========================================

client.on('error', error => {
  console.error(
    '❌ Discord client error:',
    error
  );
});

client.on('warn', warning => {
  console.warn(
    '⚠️ Discord warning:',
    warning
  );
});


// ========================================
// STARTUP
// ========================================

async function startBot() {
  try {
    console.log(
      '🔄 Connecting to MongoDB...'
    );

    await mongoClient.connect();

    console.log(
      '✅ Connected to MongoDB'
    );

    const database =
      mongoClient.db('linkbot');

    linksCollection =
      database.collection('links');

    routineSentCollection =
      database.collection('routineSent');

    console.log(
      '🔄 Logging into Discord...'
    );

    console.log(
  'Token presente:',
  Boolean(process.env.DISCORD_TOKEN)
);

console.log('Intentando login...');

const loginResult =
  await client.login(
    process.env.DISCORD_TOKEN
  );

console.log(
  'Resultado login:',
  loginResult
);

  console.log(
    '✅ Login request accepted'
  );

  } catch (error) {
    console.error(
      '❌ Failed during startup:',
      error
    );

    console.log(
      '🔄 Retrying startup in 10 seconds...'
    );

    setTimeout(
      startBot,
      10000
    );
  }
}

startBot();
