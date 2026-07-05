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

const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID;

const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

const GOOGLE_PRIVATE_KEY =
  process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(
        /\\n/g,
        '\n'
      )
    : null;

const WEATHER_API_KEY =
  process.env.WEATHER_API_KEY;

const ROUTINE_CHANNEL_ID =
  process.env.ROUTINE_CHANNEL_ID ||
  '1515018972766928946';

const LAURA_USER_ID =
  process.env.LAURA_USER_ID ||
  '808865358659584011';

const MARIO_USER_ID =
  process.env.MARIO_USER_ID ||
  '883166860407869510';

const AUTHORIZED_USERS =
  new Set([
    LAURA_USER_ID,
    MARIO_USER_ID
  ]);

const rawWeatherIntervalMinutes =
  Number(
    process.env.WEATHER_INTERVAL_MINUTES ||
    60
  );

const WEATHER_INTERVAL_MINUTES =
  Number.isFinite(rawWeatherIntervalMinutes) &&
  rawWeatherIntervalMinutes > 0
    ? rawWeatherIntervalMinutes
    : 60;

const ROUTINE_REMINDERS_ENABLED =
  String(
    process.env.ROUTINE_REMINDERS_ENABLED ||
    'true'
  ).toLowerCase() === 'true';

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
    timezone:
      'America/Argentina/Cordoba',
    dailySummaryTime: '11:00'
  },
  {
    key: 'mario',
    displayName: 'Mario',
    displayTitle: 'Mario 💚',
    heart: '💚',
    reminderColor: 0x3eb3b1,
    forecastQuery: '14.6417,-90.5133',
    weatherLabel:
      'Ciudad de Guatemala',
    diarySheetName:
      'Diario Mario',
    sheetName: 'Bot Mario',
    userId: MARIO_USER_ID,
    timezone:
      'America/Guatemala',
    dailySummaryTime: '08:00'
  }
];


// ========================================
// GLOBAL DEBUG / LOGGING
// ========================================

let routineCheckCounter = 0;

function timestamp() {
  return moment()
    .tz('America/Argentina/Cordoba')
    .format('YYYY-MM-DD HH:mm:ss.SSS');
}

function createRoutineCheckId() {
  routineCheckCounter += 1;
  return routineCheckCounter;
}

function log(checkId, scope, message) {
  console.log(
    `[${timestamp()}] ` +
    `[CHECK #${checkId}] ` +
    `[${scope}] ` +
    message
  );
}

function logError(
  checkId,
  scope,
  message,
  error
) {
  console.error(
    `[${timestamp()}] ` +
    `[CHECK #${checkId}] ` +
    `[${scope}] ` +
    message,
    error
  );
}

function logStepStart(
  checkId,
  scope,
  step
) {
  console.log(
    `[${timestamp()}] ` +
    `[CHECK #${checkId}] ` +
    `[${scope}] ▶ START ${step}`
  );
}

function logStepEnd(
  checkId,
  scope,
  step,
  started
) {
  console.log(
    `[${timestamp()}] ` +
    `[CHECK #${checkId}] ` +
    `[${scope}] ✔ END ${step} ` +
    `(${Date.now() - started} ms)`
  );
}

async function measureStep(
  checkId,
  scope,
  step,
  callback
) {
  const started =
    Date.now();

  logStepStart(
    checkId,
    scope,
    step
  );

  try {
    const result =
      await callback();

    logStepEnd(
      checkId,
      scope,
      step,
      started
    );

    return result;
  } catch (error) {

    logError(
      checkId,
      scope,
      `FAILED ${step}`,
      error
    );

    throw error;
  }
}


// ========================================
// MONGODB
// ========================================

const mongoClient =
  new MongoClient(
    process.env.MONGODB_URI
  );

let linksCollection;
let routineSentCollection;


// ========================================
// GOOGLE SHEETS
// ========================================

let sheetsClient;

function getSheetsClient() {

  if (sheetsClient) {
    return sheetsClient;
  }

  const missing = [];

  if (!GOOGLE_SHEET_ID) {
    missing.push(
      'GOOGLE_SHEET_ID'
    );
  }

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    missing.push(
      'GOOGLE_SERVICE_ACCOUNT_EMAIL'
    );
  }

  if (!GOOGLE_PRIVATE_KEY) {
    missing.push(
      'GOOGLE_PRIVATE_KEY'
    );
  }

  if (missing.length > 0) {

    throw new Error(
      'Missing Google Sheets environment variables: ' +
      missing.join(', ')
    );

  }

  const auth =
    new google.auth.JWT({

      email:
        GOOGLE_SERVICE_ACCOUNT_EMAIL,

      key:
        GOOGLE_PRIVATE_KEY,

      scopes: [
        'https://www.googleapis.com/auth/spreadsheets'
      ]

    });

  sheetsClient =
    google.sheets({

      version: 'v4',

      auth

    });

  return sheetsClient;

}


// ========================================
// GLOBAL ERROR HANDLERS
// ========================================

process.on(
  'unhandledRejection',
  error => {

    console.error(
      '❌ Unhandled promise rejection:',
      error
    );

  }
);

process.on(
  'uncaughtException',
  error => {

    console.error(
      '❌ Uncaught exception:',
      error
    );

  }
);

process.on(
  'uncaughtExceptionMonitor',
  error => {

    console.error(
      '❌ Uncaught exception monitor:',
      error
    );

  }
);

process.on(
  'warning',
  warning => {

    console.warn(
      '⚠️ Node warning:',
      warning
    );

  }
);

process.on(
  'SIGINT',
  async () => {

    console.log(
      '⚠️ Bot shutting down (SIGINT)'
    );

    try {

      await mongoClient.close();

      console.log(
        '✅ MongoDB connection closed'
      );

    } catch (error) {

      console.error(
        '❌ Error while closing MongoDB:',
        error
      );

    }

    process.exit(0);

  }
);

process.on(
  'SIGTERM',
  async () => {

    console.log(
      '⚠️ Bot shutting down (SIGTERM)'
    );

    try {

      await mongoClient.close();

      console.log(
        '✅ MongoDB connection closed'
      );

    } catch (error) {

      console.error(
        '❌ Error while closing MongoDB:',
        error
      );

    }

    process.exit(0);

  }
);


// ========================================
// CLIENT SETUP
// ========================================

const client =
  new Client({

    intents: [
      GatewayIntentBits.Guilds
    ]

  });

client.on(
  'ready',
  () => {

    console.log(
      'READY EVENT DISPARADO'
    );

  }
);


// ========================================
// DISCORD DEBUGGING
// ========================================

client.on(
  'disconnect',
  event => {

    console.warn(
      '⚠️ Discord disconnected:',
      event
    );

  }
);

client.on(
  'reconnecting',
  () => {

    console.log(
      '🔄 Discord reconnecting...'
    );

  }
);

client.on(
  'resume',
  replayed => {

    console.log(
      `✅ Discord resumed (${replayed} events replayed)`
    );

  }
);

client.on(
  'shardError',
  error => {

    console.error(
      '❌ WebSocket shard error:',
      error
    );

  }
);

client.on(
  'invalidated',
  () => {

    console.error(
      '❌ Discord session invalidated'
    );

  }
);


// ========================================
// KEEPALIVE SERVER
// ========================================

http
  .createServer((req, res) => {

    res.writeHead(200);

    res.end(
      'Bot is awake!'
    );

  })
  .listen(
    process.env.PORT || 3000,

    () => {

      console.log(
        `🌐 Keepalive server running on port ${
          process.env.PORT || 3000
        }`
      );

    }
  );

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
        .setDescription(
          'The link you want to save for later'
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('get')
    .setDescription(
      'Get a random saved link'
    ),

  new SlashCommandBuilder()
    .setName('count')
    .setDescription(
      'Check how many links you have left'
    ),

  new SlashCommandBuilder()
    .setName('weather')
    .setDescription(
      'Update weather in Google Sheets'
    ),

  new SlashCommandBuilder()
    .setName('routine')
    .setDescription(
      'Read today’s routine from Google Sheets'
    )

].map(command => command.toJSON());


// ========================================
// SMALL HELPERS
// ========================================

function trimDiscordMessage(
  message,
  maxLength = 1900
) {

  if (message.length <= maxLength) {
    return message;
  }

  return (
    message.slice(
      0,
      maxLength - 20
    ) +
    '\n\n...'
  );

}

function normalizeTime(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  const text =
    String(value).trim();

  const match =
    text.match(
      /(\d{1,2})[:.](\d{2})/
    );

  if (!match) {
    return text;
  }

  const hour =
    match[1].padStart(2, '0');

  const minute =
    match[2];

  return `${hour}:${minute}`;

}

function isSendEnabled(value) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return true;
  }

  const text =
    String(value)
      .trim()
      .toLowerCase();

  return ![
    'false',
    'falso',
    'no',
    '0'
  ].includes(text);

}

/*
 * Si la actividad ya contiene una hora:
 *
 * 14:00 • Almorzar
 *
 * se utiliza esa hora y no la de la columna.
 *
 * Si no tiene hora embebida,
 * utiliza la hora de la planilla.
 */

function getFormattedRoutineActivity(
  row
) {

  const activity =
    String(
      row.activity || ''
    ).trim();

  if (!activity) {
    return '';
  }

  const embeddedTimeMatch =
    activity.match(
      /^(\d{1,2}:\d{2})\s*[•|]\s*(.+)$/s
    );

  if (embeddedTimeMatch) {

    const embeddedTime =
      normalizeTime(
        embeddedTimeMatch[1]
      );

    const activityText =
      embeddedTimeMatch[2].trim();

    return (
      `${embeddedTime} • ${activityText}`
    );

  }

  if (row.time) {

    return (
      `${row.time} • ${activity}`
    );

  }

  return activity;

}

function getRoutineTriggerTime(
  row
) {

  const activity =
    String(
      row.activity || ''
    ).trim();

  const embeddedTimeMatch =
    activity.match(
      /^(\d{1,2}:\d{2})\s*[•|]\s*(.+)$/s
    );

  if (embeddedTimeMatch) {

    return normalizeTime(
      embeddedTimeMatch[1]
    );

  }

  return normalizeTime(
    row.time
  );

}

function formatSpecialReminder(
  part
) {

  const cleaned =
    String(part || '')
      .trim()
      .replace(/^•+\s*/, '')
      .replace(/\s*•+$/, '')
      .trim();

  if (!cleaned) {
    return '';
  }

  return `• ${cleaned} •`;

}

function getSpecialReminderLines(
  activity
) {

  return String(activity || '')
    .split('\n')
    .map(
      formatSpecialReminder
    )
    .filter(Boolean);

}

function getSpanishWeekday(
  momentDate
) {

  const days = [
    'domingo',
    'lunes',
    'martes',
    'miércoles',
    'jueves',
    'viernes',
    'sábado'
  ];

  return days[
    momentDate.day()
  ];

}

// ========================================
// HTTPS JSON HELPER
// ========================================

function fetchJson(url) {

  return new Promise(
    (resolve, reject) => {

      const request =
        https.get(

          url,

          {
            headers: {
              'User-Agent':
                'Kotori-Discord-Bot-Agenda/1.0'
            }
          },

          response => {

            let body = '';

            response.on(
              'data',
              chunk => {
                body += chunk;
              }
            );

            response.on(
              'end',
              () => {

                let parsed;

                try {

                  parsed =
                    JSON.parse(body);

                } catch (error) {

                  return reject(
                    new Error(
                      'Could not parse JSON response: ' +
                      error.message
                    )
                  );

                }

                resolve({

                  statusCode:
                    response.statusCode,

                  body:
                    parsed

                });

              }
            );

          }
        );

      request.setTimeout(

        15000,

        () => {

          request.destroy(
            new Error(
              'Request timeout'
            )
          );

        }

      );

      request.on(
        'error',
        error => {

          reject(error);

        }
      );

    }
  );

}


// ========================================
// WEATHER
// ========================================

let weatherUpdateRunning =
  false;

let weatherSchedulerStarted =
  false;

async function getWeatherFromWeatherApi(
  query,
  cityLabel
) {

  if (!WEATHER_API_KEY) {

    return {

      ok: false,

      text: '',

      error:
        `${cityLabel} - falta WEATHER_API_KEY`

    };

  }

  const params =
    new URLSearchParams({

      key:
        WEATHER_API_KEY,

      q:
        query,

      aqi:
        'no',

      lang:
        'es'

    });

  const url =
    'https://api.weatherapi.com/v1/current.json?' +
    params.toString();

  try {

    const response =
      await fetchJson(url);

    if (
      response.statusCode !== 200
    ) {

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
          `${cityLabel} - Código HTTP ${response.statusCode}${apiMessage}`

      };

    }

    const data =
      response.body;

    if (!data.current) {

      return {

        ok: false,

        text: '',

        error:
          `${cityLabel} - respuesta inválida`

      };

    }

    const temperature =
      data.current.temp_c;

    const condition =

      data.current.condition &&
      data.current.condition.text

        ? data.current.condition.text

        : 'Clima variable';

    return {

      ok: true,

      text:
        `${cityLabel}: ${temperature}°C · ${condition}`,

      error: ''

    };

  }

  catch (error) {

    return {

      ok: false,

      text: '',

      error:
        `${cityLabel} - ${error.message}`

    };

  }

}

async function getDailyForecastFromWeatherApi(
  query,
  cityLabel
) {

  if (!WEATHER_API_KEY) {

    return {

      ok: false,

      text: '',

      error:
        `${cityLabel} - falta WEATHER_API_KEY`

    };

  }

  const params =
    new URLSearchParams({

      key:
        WEATHER_API_KEY,

      q:
        query,

      days:
        '1',

      aqi:
        'no',

      alerts:
        'no',

      lang:
        'es'

    });

  const url =
    'https://api.weatherapi.com/v1/forecast.json?' +
    params.toString();

  try {

    const response =
      await fetchJson(url);

    if (
      response.statusCode !== 200
    ) {

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
          `${cityLabel} - Código HTTP ${response.statusCode}${apiMessage}`

      };

    }

    const forecastDays =
      response.body?.forecast?.forecastday;

    if (
      !Array.isArray(forecastDays) ||
      forecastDays.length === 0 ||
      !forecastDays[0].day
    ) {

      return {

        ok: false,

        text: '',

        error:
          `${cityLabel} - respuesta sin pronóstico`

      };

    }

    const day =
      forecastDays[0].day;

    const minimum =
      Math.round(day.mintemp_c);

    const maximum =
      Math.round(day.maxtemp_c);

    const rainChance =
      Number(
        day.daily_chance_of_rain || 0
      );

    const condition =
      day.condition?.text ||
      'Clima variable';

    return {

      ok: true,

      text:
        `**Clima para hoy en ${cityLabel}**\n` +
        `Mínima: ${minimum}°C • Máxima: ${maximum}°C\n` +
        `${condition} • ${rainChance}% de probabilidad de lluvia`,

      error: ''

    };

  }

  catch (error) {

    return {

      ok: false,

      text: '',

      error:
        `${cityLabel} - ${error.message}`

    };

  }

}

async function updateWeatherInSheet(
  reason = 'scheduled'
) {

  if (weatherUpdateRunning) {

    return {

      skipped: true,

      message:
        'Weather update already running.'

    };

  }

  weatherUpdateRunning = true;

  try {

    const sheets =
      getSheetsClient();

    console.log(
      `🌦️ Updating weather (${reason})`
    );

    const cordoba =
      await getWeatherFromWeatherApi(
        '-31.4201,-64.1888',
        'Córdoba'
      );

    const guatemala =
      await getWeatherFromWeatherApi(
        '14.6417,-90.5133',
        'Ciudad de Guatemala'
      );

    const nowText =
      moment()
        .tz(
          'America/Argentina/Cordoba'
        )
        .format(
          'DD/MM/YYYY HH:mm'
        );

    const data = [

      {
        range:
          "'Guía'!Z1",

        values: [[
          `Último intento Render: ${nowText}`
        ]]
      },

      {
        range:
          "'Guía'!Z2",

        values: [[
          cordoba.ok
            ? 'Córdoba OK'
            : cordoba.error
        ]]
      },

      {
        range:
          "'Guía'!Z3",

        values: [[
          guatemala.ok
            ? 'Guatemala OK'
            : guatemala.error
        ]]
      },

      {
        range:
          "'Guía'!Z4",

        values: [[
          `Origen: Render WeatherAPI (${reason})`
        ]]
      }

    ];

    if (cordoba.ok) {

      data.push({

        range:
          "'Guía'!F3",

        values: [[
          cordoba.text
        ]]

      });

    }

    if (guatemala.ok) {

      data.push({

        range:
          "'Guía'!F5",

        values: [[
          guatemala.text
        ]]

      });

    }

    await sheets
      .spreadsheets
      .values
      .batchUpdate({

        spreadsheetId:
          GOOGLE_SHEET_ID,

        requestBody: {

          valueInputOption:
            'USER_ENTERED',

          data

        }

      });

    console.log(
      '✅ Weather update finished.'
    );

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

  }

  finally {

    weatherUpdateRunning = false;

  }

}

function startWeatherScheduler() {

  if (
    weatherSchedulerStarted
  ) {
    return;
  }

  weatherSchedulerStarted = true;

  console.log(

    `🌦️ Weather scheduler enabled (${WEATHER_INTERVAL_MINUTES} min)`

  );

  setTimeout(

    async () => {

      try {

        await updateWeatherInSheet(
          'startup'
        );

      }

      catch (error) {

        console.error(

          '❌ Weather startup failed:',

          error

        );

      }

    },

    5000

  );

  setInterval(

    async () => {

      try {

        await updateWeatherInSheet(
          'scheduled'
        );

      }

      catch (error) {

        console.error(

          '❌ Scheduled weather update failed:',

          error

        );

      }

    },

    WEATHER_INTERVAL_MINUTES *
      60 *
      1000

  );

}

// ========================================
// ROUTINE / GOOGLE SHEETS
// ========================================

async function readRoutineRows(
  config
) {

  const sheets =
    getSheetsClient();

  const response =
    await sheets
      .spreadsheets
      .values
      .get({

        spreadsheetId:
          GOOGLE_SHEET_ID,

        range:
          `'${config.sheetName}'!A2:E`,

        valueRenderOption:
          'FORMATTED_VALUE'

      });

  const values =
    response.data.values || [];

  const rows = [];

  for (const row of values) {

    const date =
      row[0] || '';

    const time =
      normalizeTime(
        row[1] || ''
      );

    const type =
      String(
        row[3] || ''
      )
        .trim()
        .toLowerCase();

    const enabled =
      isSendEnabled(
        row[4]
      );

    if (!enabled) {
      continue;
    }

    const activities =
      String(
        row[2] || ''
      )
        .split(/\r?\n/)
        .map(v => v.trim())
        .filter(Boolean);

    for (const activity of activities) {

      rows.push({

        date,

        time,

        activity,

        type,

        sendEnabled: true

      });

    }

  }

  return rows.filter(
    row => row.activity
  );

}

async function readDailyNote(
  config
) {

  try {

    const sheets =
      getSheetsClient();

    const response =
      await sheets
        .spreadsheets
        .values
        .get({

          spreadsheetId:
            GOOGLE_SHEET_ID,

          range:
            `'${config.diarySheetName}'!G6`,

          valueRenderOption:
            'FORMATTED_VALUE'

        });

    const values =
      response.data.values || [];

    if (
      values.length === 0 ||
      !values[0] ||
      values[0][0] === undefined
    ) {

      return '';

    }

    return String(
      values[0][0]
    ).trim();

  }

  catch (error) {

    console.error(

      `❌ Could not read notes for ${config.displayName}:`,

      error

    );

    return '';

  }

}

async function readAutoReminders(
  config
) {

  try {

    const sheets =
      getSheetsClient();

    const startRow = 7;

    const range =
      config.key === 'laura'
        ? "'Recordatorios'!E7:F11"
        : "'Recordatorios'!B7:C11";

    const response =
      await sheets
        .spreadsheets
        .values
        .get({

          spreadsheetId:
            GOOGLE_SHEET_ID,

          range,

          valueRenderOption:
            'FORMATTED_VALUE'

        });

    const values =
      response.data.values || [];

    return values

      .map((row, index) => ({

        rowNumber:
          startRow + index,

        time:
          normalizeTime(
            row[0] || ''
          ),

        activity:
          String(
            row[1] || ''
          ).trim()

      }))

      .filter(
        row =>
          row.time &&
          row.activity
      );

  }

  catch (error) {

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

    const sheets =
      getSheetsClient();

    const range =
      config.key === 'laura'
        ? `'Recordatorios'!E${rowNumber}:F${rowNumber}`
        : `'Recordatorios'!B${rowNumber}:C${rowNumber}`;

    await sheets
      .spreadsheets
      .values
      .clear({

        spreadsheetId:
          GOOGLE_SHEET_ID,

        range

      });

  }

  catch (error) {

    console.error(

      `❌ Could not clear auto reminder for ${config.displayName}:`,

      error

    );

  }

}

async function readPatyReminders() {

  const sheets =
    getSheetsClient();

  const response =
    await sheets
      .spreadsheets
      .values
      .get({

        spreadsheetId:
          GOOGLE_SHEET_ID,

        range:
          "'Paty Viena'!B3:E",

        valueRenderOption:
          'FORMATTED_VALUE'

      });

  const values =
    response.data.values || [];

  return values

    .map(row => ({

      time:
        normalizeTime(
          row[0] || ''
        ),

      activity:
        String(
          row[1] || ''
        ).trim(),

      date:
        String(
          row[3] || ''
        ).trim()

    }))

    .filter(
      row =>
        row.time &&
        row.activity &&
        row.date
    );

}

// ========================================
// ROUTINE DISPLAY
// ========================================

function buildRoutineDisplay(
  config,
  rows
) {

  const scheduledRows =
    rows.filter(
      row => row.type === 'horario'
    );

  const specialRows =
    rows.filter(
      row => row.type === 'especial'
    );

  const lines = [];

  lines.push(
    `**${config.displayTitle}**`
  );

  lines.push(
    '**Actividades de hoy**'
  );

  if (scheduledRows.length === 0) {

    lines.push(
      'No hay actividades con horario.'
    );

  }

  else {

    for (const row of scheduledRows) {

      lines.push(
        getFormattedRoutineActivity(row)
      );

    }

  }

  if (specialRows.length > 0) {

    lines.push('');
    lines.push(
      '**Recordatorios especiales**'
    );

    for (const row of specialRows) {

      const reminderLines =
        getSpecialReminderLines(
          row.activity
        );

      lines.push(
        ...reminderLines
      );

    }

  }

  return lines.join('\n');

}

function buildManualRoutineMessage(
  sections
) {

  return trimDiscordMessage(
    sections.join('\n\n')
  );

}


// ========================================
// DAILY SUMMARY
// ========================================

function buildDailyRoutineSummary(
  config,
  rows,
  note,
  forecast
) {

  const scheduledRows =
    rows.filter(
      row => row.type === 'horario'
    );

  const specialRows =
    rows.filter(
      row => row.type === 'especial'
    );

  const lines = [];

  lines.push(
    '**Actividades de hoy**'
  );

  if (scheduledRows.length === 0) {

    lines.push(
      'No hay actividades con horario.'
    );

  }

  else {

    for (const row of scheduledRows) {

      lines.push(
        getFormattedRoutineActivity(row)
      );

    }

  }

  if (specialRows.length > 0) {

    lines.push('');
    lines.push(
      '**Recordatorios especiales**'
    );

    for (const row of specialRows) {

      lines.push(
        ...getSpecialReminderLines(
          row.activity
        )
      );

    }

  }

  if (note) {

    lines.push('');
    lines.push('**Notas**');
    lines.push(note);

  }

  if (forecast.ok) {

    lines.push('');
    lines.push(
      forecast.text
    );

  }

  return new EmbedBuilder()

    .setColor(
      config.reminderColor
    )

    .setDescription(
      lines.join('\n')
    );

}


// ========================================
// ROUTINE DATABASE
// ========================================

async function getRoutineChannel() {

  const channel =
    await client.channels.fetch(
      ROUTINE_CHANNEL_ID
    );

  if (!channel) {

    throw new Error(
      'Routine channel not found.'
    );

  }

  if (!channel.isTextBased()) {

    throw new Error(
      'Routine channel is not text based.'
    );

  }

  return channel;

}

async function wasRoutineSent(
  key
) {

  if (!routineSentCollection) {
    return false;
  }

  const existing =
    await routineSentCollection.findOne({
      key
    });

  return Boolean(existing);

}

async function markRoutineSent(
  key
) {

  if (!routineSentCollection) {
    return;
  }

  await routineSentCollection.updateOne(

    {
      key
    },

    {

      $setOnInsert: {

        key,

        sentAt:
          new Date()

      }

    },

    {

      upsert: true

    }

  );

}

// ========================================
// DAILY SUMMARY SENDER
// ========================================

async function sendDailySummaryIfNeeded(
  checkId,
  config,
  channel
) {

  const scope =
    `${config.displayName} Summary`;

  const now =
    moment().tz(
      config.timezone
    );

  const currentTime =
    now.format('HH:mm');

  if (
    currentTime !==
    config.dailySummaryTime
  ) {

    return;

  }

  const dateKey =
    now.format('YYYY-MM-DD');

  const sentKey =
    `${config.key}:${dateKey}:daily-summary`;

  log(
    checkId,
    scope,
    `Checking daily summary (${currentTime})`
  );

  if (
    await wasRoutineSent(
      sentKey
    )
  ) {

    log(
      checkId,
      scope,
      'Already sent.'
    );

    return;

  }

  const rows =
    await measureStep(
      checkId,
      scope,
      'Read routine rows',

      () =>
        readRoutineRows(
          config
        )
    );

  const note =
    await measureStep(
      checkId,
      scope,
      'Read diary',

      () =>
        readDailyNote(
          config
        )
    );

  const forecast =
    await measureStep(
      checkId,
      scope,
      'Read weather',

      () =>
        getDailyForecastFromWeatherApi(
          config.forecastQuery,
          config.weatherLabel
        )
    );

  const embed =
    buildDailyRoutineSummary(

      config,

      rows,

      note,

      forecast

    );

  const weekday =
    getSpanishWeekday(
      now
    );

  await measureStep(

    checkId,

    scope,

    'Discord send',

    () =>
      channel.send({

        content:
          `Feliz ${weekday} <@${config.userId}> ${config.heart}`,

        embeds: [
          embed
        ]

      })

  );

  await measureStep(

    checkId,

    scope,

    'Mark sent',

    () =>
      markRoutineSent(
        sentKey
      )

  );

  log(

    checkId,

    scope,

    'Daily summary completed.'

  );

}

// ========================================
// TIMED REMINDERS
// ========================================

async function sendTimedRemindersIfNeeded(
  checkId,
  config,
  channel
) {

  const scope =
    `${config.displayName} Reminders`;

  const now =
    moment().tz(
      config.timezone
    );

  const currentTime =
    now.format('HH:mm');

  const dateKey =
    now.format('YYYY-MM-DD');

  log(
    checkId,
    scope,
    `Current time: ${currentTime}`
  );

  const rows =
    await measureStep(

      checkId,

      scope,

      'Read routine',

      () =>
        readRoutineRows(
          config
        )

    );

  const dueRows =
    rows.filter(row =>

      row.type === 'horario' &&

      getRoutineTriggerTime(row) ===
        currentTime

    );

  log(

    checkId,

    scope,

    `Due reminders: ${dueRows.length}`

  );

  if (
    dueRows.length === 0
  ) {

    return;

  }

  for (const row of dueRows) {

    const triggerTime =
      getRoutineTriggerTime(
        row
      );

    const sentKey =
      `${config.key}:${dateKey}:reminder:${triggerTime}:${row.activity}`;

    const reminderScope =
      `${scope} (${triggerTime})`;

    log(

      checkId,

      reminderScope,

      `Processing "${row.activity}"`

    );

    const alreadySent =
      await measureStep(

        checkId,

        reminderScope,

        'Check database',

        () =>
          wasRoutineSent(
            sentKey
          )

      );

    if (alreadySent) {

      log(

        checkId,

        reminderScope,

        'Already sent.'

      );

      continue;

    }

    const formattedActivity =
      getFormattedRoutineActivity(
        row
      );

    const embed =
      new EmbedBuilder()

        .setColor(
          config.reminderColor
        )

        .setTitle(
          'Recordatorio'
        )

        .setDescription(
          formattedActivity
        );

    await measureStep(

      checkId,

      reminderScope,

      'Discord send',

      () =>
        channel.send({

          content:
            `<@${config.userId}> | ${formattedActivity}`,

          embeds: [
            embed
          ]

        })

    );

    await measureStep(

      checkId,

      reminderScope,

      'Mark sent',

      () =>
        markRoutineSent(
          sentKey
        )

    );

    log(

      checkId,

      reminderScope,

      'Reminder finished.'

    );

  }

}

// ========================================
// AUTO REMINDERS
// ========================================

async function sendAutoRemindersIfNeeded(
  checkId,
  config,
  channel
) {

  const scope =
    `${config.displayName} Auto`;

  const now =
    moment().tz(
      config.timezone
    );

  const currentTime =
    now.format('HH:mm');

  const dateKey =
    now.format('YYYY-MM-DD');

  log(
    checkId,
    scope,
    `Current time: ${currentTime}`
  );

  const reminders =
    await measureStep(

      checkId,

      scope,

      'Read auto reminders',

      () =>
        readAutoReminders(
          config
        )

    );

  const dueReminders =
    reminders.filter(
      reminder =>
        reminder.time === currentTime
    );

  log(
    checkId,
    scope,
    `Due auto reminders: ${dueReminders.length}`
  );

  if (
    dueReminders.length === 0
  ) {
    return;
  }

  for (const reminder of dueReminders) {

    const reminderScope =
      `${scope} (${reminder.time})`;

    const sentKey =
      `${config.key}:${dateKey}:auto:${reminder.time}:${reminder.activity}`;

    log(
      checkId,
      reminderScope,
      `Processing "${reminder.activity}"`
    );

    const alreadySent =
      await measureStep(

        checkId,

        reminderScope,

        'Check database',

        () =>
          wasRoutineSent(
            sentKey
          )

      );

    if (alreadySent) {

      log(
        checkId,
        reminderScope,
        'Already sent.'
      );

      continue;

    }

    const embed =
      new EmbedBuilder()

        .setColor(
          config.reminderColor
        )

        .setTitle(
          'Recordatorio'
        )

        .setDescription(
          `${reminder.time} • ${reminder.activity}`
        );

    await measureStep(

      checkId,

      reminderScope,

      'Discord send',

      () =>
        channel.send({

          content:
            `<@${config.userId}> | ${reminder.activity}`,

          embeds: [
            embed
          ]

        })

    );

    await measureStep(

      checkId,

      reminderScope,

      'Mark sent',

      () =>
        markRoutineSent(
          sentKey
        )

    );

    await measureStep(

      checkId,

      reminderScope,

      'Clear reminder',

      () =>
        clearAutoReminder(
          config,
          reminder.rowNumber
        )

    );

    log(
      checkId,
      reminderScope,
      'Auto reminder completed.'
    );

  }

}

// ========================================
// PATY REMINDERS
// ========================================

async function sendPatyRemindersIfNeeded(
  checkId,
  channel
) {

  const scope = 'Paty';

  const now =
    moment().tz(
      'America/Argentina/Cordoba'
    );

  const currentTime =
    now.format('HH:mm');

  const currentDate =
    now.format('DD/MM');

  log(
    checkId,
    scope,
    `Current time: ${currentTime} (${currentDate})`
  );

  const reminders =
    await measureStep(

      checkId,

      scope,

      'Read Paty reminders',

      () =>
        readPatyReminders()

    );

  const dueReminders =
    reminders.filter(
      reminder =>
        reminder.time === currentTime &&
        reminder.date === currentDate
    );

  log(
    checkId,
    scope,
    `Due reminders: ${dueReminders.length}`
  );

  if (
    dueReminders.length === 0
  ) {
    return;
  }

  for (const reminder of dueReminders) {

    const reminderScope =
      `Paty ${reminder.time}`;

    const sentKey =
      `paty:${now.format('YYYY-MM-DD')}:${reminder.time}:${reminder.activity}`;

    log(
      checkId,
      reminderScope,
      `Processing "${reminder.activity}"`
    );

    const alreadySent =
      await measureStep(

        checkId,

        reminderScope,

        'Check database',

        () =>
          wasRoutineSent(
            sentKey
          )

      );

    if (alreadySent) {

      log(
        checkId,
        reminderScope,
        'Already sent.'
      );

      continue;

    }

    const embed =
      new EmbedBuilder()

        .setColor(
          0xcc2a80
        )

        .setTitle(
          'Agitar las gotas'
        )

        .setDescription(
          `${reminder.time} • ${reminder.activity}`
        );

    await measureStep(

      checkId,

      reminderScope,

      'Discord send',

      () =>
        channel.send({

          content:
            `<@${LAURA_USER_ID}> | ${reminder.time} • ${reminder.activity}`,

          embeds: [
            embed
          ]

        })

    );

    await measureStep(

      checkId,

      reminderScope,

      'Mark sent',

      () =>
        markRoutineSent(
          sentKey
        )

    );

    log(
      checkId,
      reminderScope,
      'Reminder completed.'
    );

  }

}

// ========================================
// ROUTINE SCHEDULER
// ========================================

let routineSchedulerStarted =
  false;

let routineCheckRunning =
  false;

async function checkRoutineTasks() {

  if (!ROUTINE_REMINDERS_ENABLED) {
    return;
  }

  if (routineCheckRunning) {

    console.warn(
      '⚠️ Previous routine check still running.'
    );

    return;

  }

  routineCheckRunning = true;

  const checkId =
    createRoutineCheckId();

  const started =
    Date.now();

  log(
    checkId,
    'SYSTEM',
    'Routine check started.'
  );

  try {

    const channel =
      await measureStep(

        checkId,

        'SYSTEM',

        'Fetch routine channel',

        () =>
          getRoutineChannel()

      );

    const tasks = [];

    for (const config of ROUTINE_CONFIGS) {

      tasks.push(

        (async () => {

          try {

            await sendDailySummaryIfNeeded(
              checkId,
              config,
              channel
            );

          }

          catch (error) {

            logError(
              checkId,
              config.displayName,
              'Daily summary failed',
              error
            );

          }

        })()

      );

    }

      tasks.push(

      (async () => {

        try {

          await sendPatyRemindersIfNeeded(
            checkId,
            channel
          );

        }

        catch (error) {

          logError(
            checkId,
            'Paty',
            'Paty reminders failed',
            error
          );

        }

      })()

    );

    tasks.push(

      (async () => {

        try {

          await sendThursdayGifIfNeeded(
            checkId,
            channel
          );

        }

        catch (error) {

          logError(
            checkId,
            'Thursday GIF',
            'GIF sender failed',
            error
          );

        }

      })()

    );

    for (const config of ROUTINE_CONFIGS) {

      tasks.push(

        (async () => {

          try {

            await sendTimedRemindersIfNeeded(
              checkId,
              config,
              channel
            );

          }

          catch (error) {

            logError(
              checkId,
              config.displayName,
              'Timed reminders failed',
              error
            );

          }

        })()

      );

      tasks.push(

        (async () => {

          try {

            await sendAutoRemindersIfNeeded(
              checkId,
              config,
              channel
            );

          }

          catch (error) {

            logError(
              checkId,
              config.displayName,
              'Auto reminders failed',
              error
            );

          }

        })()

      );

    }

    log(
      checkId,
      'SYSTEM',
      `Launching ${tasks.length} async task(s).`
    );

    await Promise.allSettled(
      tasks
    );

    log(
      checkId,
      'SYSTEM',
      'All routine tasks finished.'
    );

  }

  catch (error) {

    logError(
      checkId,
      'SYSTEM',
      'Routine check failed',
      error
    );

  }

  finally {

    log(
      checkId,
      'SYSTEM',
      `Routine check completed (${Date.now() - started} ms)`
    );

    routineCheckRunning = false;

  }

}

    tasks.push(

      (async () => {

        try {

          await sendPatyRemindersIfNeeded(
            checkId,
            channel
          );

        }

        catch (error) {

          logError(
            checkId,
            'Paty',
            'Paty reminders failed',
            error
          );

        }

      })()

    );

    tasks.push(

      (async () => {

        try {

          await sendThursdayGifIfNeeded(
            checkId,
            channel
          );

        }

        catch (error) {

          logError(
            checkId,
            'Thursday GIF',
            'GIF sender failed',
            error
          );

        }

      })()

    );

    for (const config of ROUTINE_CONFIGS) {

      tasks.push(

        (async () => {

          try {

            await sendTimedRemindersIfNeeded(
              checkId,
              config,
              channel
            );

          }

          catch (error) {

            logError(
              checkId,
              config.displayName,
              'Timed reminders failed',
              error
            );

          }

        })()

      );

      tasks.push(

        (async () => {

          try {

            await sendAutoRemindersIfNeeded(
              checkId,
              config,
              channel
            );

          }

          catch (error) {

            logError(
              checkId,
              config.displayName,
              'Auto reminders failed',
              error
            );

          }

        })()

      );

    }

    log(
      checkId,
      'SYSTEM',
      `Launching ${tasks.length} async task(s).`
    );

    await Promise.allSettled(
      tasks
    );

    log(
      checkId,
      'SYSTEM',
      'All routine tasks finished.'
    );

  }

  catch (error) {

    logError(
      checkId,
      'SYSTEM',
      'Routine check failed',
      error
    );

  }

  finally {

    log(
      checkId,
      'SYSTEM',
      `Routine check completed (${Date.now() - started} ms)`
    );

    routineCheckRunning = false;

  }

}

function startRoutineScheduler() {

  if (routineSchedulerStarted) {

    console.log(
      '🕒 Routine scheduler already started.'
    );

    return;

  }

  routineSchedulerStarted = true;

  if (!ROUTINE_REMINDERS_ENABLED) {

    console.log(
      '🕒 Routine reminders disabled by environment variable.'
    );

    return;

  }

  console.log('');
  console.log('═══════════════════════════════');
  console.log(' ROUTINE SCHEDULER');
  console.log('═══════════════════════════════');

  console.log(
    `✔ Enabled : ${ROUTINE_REMINDERS_ENABLED}`
  );

  console.log(
    '✔ Interval: 60 seconds'
  );

  console.log(
    '✔ First execution in 5 seconds'
  );

  console.log('═══════════════════════════════');
  console.log('');

  setTimeout(

    async () => {

      try {

        await checkRoutineTasks();

      }

      catch (error) {

        console.error(
          '❌ Initial routine execution failed:',
          error
        );

      }

    },

    5000

  );

  setInterval(

    async () => {

      try {

        await checkRoutineTasks();

      }

      catch (error) {

        console.error(
          '❌ Scheduled routine execution failed:',
          error
        );

      }

    },

    60 * 1000

  );

}

// ========================================
// READY EVENT
// ========================================

client.once(
  'ready',
  async () => {

    console.log('');
    console.log('═══════════════════════════════');
    console.log(' BOT READY');
    console.log('═══════════════════════════════');

    console.log(
      `✅ Logged in as ${client.user.tag}`
    );

    try {

      const startup =
        Date.now();

      const rest =
        new REST({
          version: '10'
        }).setToken(
          process.env.DISCORD_TOKEN
        );

      await measureStep(

        0,

        'STARTUP',

        'Register Slash Commands',

        () =>
          rest.put(

            Routes.applicationCommands(
              client.user.id
            ),

            {
              body:
                commands
            }

          )

      );

      console.log(
        '✅ Slash commands registered.'
      );

      await measureStep(

        0,

        'STARTUP',

        'Start Weather Scheduler',

        async () => {

          startWeatherScheduler();

        }

      );

      await measureStep(

        0,

        'STARTUP',

        'Start Routine Scheduler',

        async () => {

          startRoutineScheduler();

        }

      );

      console.log('');

      console.log(
        `✅ Startup completed in ${Date.now() - startup} ms`
      );

      console.log('═══════════════════════════════');
      console.log('');

    }

    catch (error) {

      console.error(
        '❌ Failed during ready event:',
        error
      );

    }

  }
);

// ========================================
// INTERACTIONS
// ========================================

client.on(
  'interactionCreate',
  async interaction => {

    const started =
      Date.now();

    const scope =
      'Interaction';

    try {

      if (!interaction.isChatInputCommand()) {
        return;
      }

      log(

        0,

        scope,

        `${interaction.user.tag} ejecutó /${interaction.commandName}`

      );

      await measureStep(

        0,

        scope,

        'Defer reply',

        () =>
          interaction.deferReply()

      );

      const userId =
        interaction.user.id;

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

        log(

          0,

          scope,

          `Unauthorized command: ${interaction.commandName}`

        );

        return interaction.editReply({

          content:
            'Este comando no está disponible.'

        });

      }

      // ==================================
      // /ADD
      // ==================================

      if (
        interaction.commandName ===
        'add'
      ) {

        const link =
          interaction.options.getString(
            'link'
          );

        log(

          0,

          '/add',

          `Saving link for ${interaction.user.tag}`

        );

        const existingUser =
          await measureStep(

            0,

            '/add',

            'Read MongoDB',

            () =>
              linksCollection.findOne({

                userId

              })

          );

        if (

          existingUser &&

          Array.isArray(
            existingUser.links
          ) &&

          existingUser.links.includes(
            link
          )

        ) {

          return interaction.editReply({

            content:
              'You already saved this link.'

          });

        }

        await measureStep(

          0,

          '/add',

          'Insert MongoDB',

          () =>

            linksCollection.updateOne(

              {

                userId

              },

              {

                $push: {

                  links:
                    link

                }

              },

              {

                upsert: true

              }

            )

        );

        const updatedUser =
          await measureStep(

            0,

            '/add',

            'Reload MongoDB',

            () =>
              linksCollection.findOne({

                userId

              })

          );

        const linksCount =

          updatedUser &&
          Array.isArray(
            updatedUser.links
          )

            ? updatedUser.links.length

            : 0;

        await measureStep(

          0,

          '/add',

          'Reply',

          () =>

            interaction.editReply({

              content:
                `Link saved successfully\nLinks saved: ${linksCount}`

            })

        );

        log(

          0,

          '/add',

          `Finished (${Date.now() - started} ms)`

        );

        return;

      }

          // ==================================
      // /GET
      // ==================================

      if (
        interaction.commandName ===
        'get'
      ) {

        log(

          0,

          '/get',

          `Loading links for ${interaction.user.tag}`

        );

        const userData =
          await measureStep(

            0,

            '/get',

            'Read MongoDB',

            () =>
              linksCollection.findOne({

                userId

              })

          );

        if (

          !userData ||

          !Array.isArray(
            userData.links
          ) ||

          userData.links.length === 0

        ) {

          await interaction.editReply({

            content:
              'You have no links saved'

          });

          return;

        }

        const randomIndex =
          Math.floor(

            Math.random() *
            userData.links.length

          );

        const selectedLink =
          userData.links[
            randomIndex
          ];

        userData.links.splice(

          randomIndex,

          1

        );

        await measureStep(

          0,

          '/get',

          'Update MongoDB',

          () =>

            linksCollection.updateOne(

              {

                userId

              },

              {

                $set: {

                  links:
                    userData.links

                }

              }

            )

        );

        let message =

          `Here's one of your saved links:\n\n` +

          `${selectedLink}\n\n`;

        if (
          userData.links.length === 0
        ) {

          message +=
            '(This was your last saved link)';

        }

        else {

          message +=
            `Links remaining: ${userData.links.length}`;

        }

        const isValidUrl =

          typeof selectedLink ===
            'string' &&

          (

            selectedLink.startsWith(
              'http://'
            ) ||

            selectedLink.startsWith(
              'https://'
            )

          );

        if (isValidUrl) {

          const row =
            new ActionRowBuilder()

              .addComponents(

                new ButtonBuilder()

                  .setLabel(
                    'Open link'
                  )

                  .setStyle(
                    ButtonStyle.Link
                  )

                  .setURL(
                    selectedLink
                  )

              );

          await measureStep(

            0,

            '/get',

            'Reply',

            () =>

              interaction.editReply({

                content:
                  message,

                components: [
                  row
                ]

              })

          );

        }

        else {

          await measureStep(

            0,

            '/get',

            'Reply',

            () =>

              interaction.editReply({

                content:
                  message

              })

          );

        }

        log(

          0,

          '/get',

          `Finished (${Date.now() - started} ms)`

        );

        return;

      }

          // ==================================
      // /COUNT
      // ==================================

      if (
        interaction.commandName ===
        'count'
      ) {

        log(

          0,

          '/count',

          `Counting links for ${interaction.user.tag}`

        );

        const userData =
          await measureStep(

            0,

            '/count',

            'Read MongoDB',

            () =>
              linksCollection.findOne({

                userId

              })

          );

        const count =

          userData &&
          Array.isArray(
            userData.links
          )

            ? userData.links.length

            : 0;

        await measureStep(

          0,

          '/count',

          'Reply',

          () =>

            interaction.editReply({

              content:
                `You have ${count} links saved.`

            })

        );

        log(

          0,

          '/count',

          `Finished (${Date.now() - started} ms)`

        );

        return;

      }


      // ==================================
      // /WEATHER
      // ==================================

      if (
        interaction.commandName ===
        'weather'
      ) {

        log(

          0,

          '/weather',

          `Manual weather update requested by ${interaction.user.tag}`

        );

        const result =
          await measureStep(

            0,

            '/weather',

            'Update weather',

            () =>
              updateWeatherInSheet(
                'slash command'
              )

          );

        if (
          result.skipped
        ) {

          await interaction.editReply({

            content:
              'La actualización del clima se omitió porque ya hay otra actualización en curso.'

          });

          return;

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

        await measureStep(

          0,

          '/weather',

          'Reply',

          () =>

            interaction.editReply({

              content:
                trimDiscordMessage(
                  lines.join('\n')
                )

            })

        );

        log(

          0,

          '/weather',

          `Finished (${Date.now() - started} ms)`

        );

        return;

      }

          // ==================================
      // /ROUTINE
      // ==================================

      if (
        interaction.commandName ===
        'routine'
      ) {

        log(

          0,

          '/routine',

          `Manual routine requested by ${interaction.user.tag}`

        );

        const sections = [];

        await measureStep(

          0,

          '/routine',

          'Read routines',

          async () => {

            for (
              const config of ROUTINE_CONFIGS
            ) {

              const rows =
                await readRoutineRows(
                  config
                );

              sections.push(

                buildRoutineDisplay(

                  config,

                  rows

                )

              );

            }

          }

        );

        await measureStep(

          0,

          '/routine',

          'Reply',

          () =>

            interaction.editReply({

              content:

                buildManualRoutineMessage(
                  sections
                )

            })

        );

        log(

          0,

          '/routine',

          `Finished (${Date.now() - started} ms)`

        );

        return;

      }

    }

    catch (error) {

      logError(

        0,

        'Interaction',

        `Command failed: ${interaction.commandName}`,

        error

      );

      try {

        if (

          interaction.deferred ||

          interaction.replied

        ) {

          await interaction.editReply({

            content:
              'Something went wrong while processing your request.\n\nCheck the Render logs for the full error.'

          });

        }

        else {

          await interaction.reply({

            content:
              'Something went wrong while processing your request.\n\nCheck the Render logs for the full error.',

            ephemeral: true

          });

        }

      }

      catch (replyError) {

        logError(

          0,

          'Interaction',

          'Failed to send error reply',

          replyError

        );

      }

    }

  }

);

// ========================================
// CLIENT ERRORS
// ========================================

client.on(
  'error',
  error => {

    console.error(
      '❌ Discord client error:',
      error
    );

  }
);

client.on(
  'warn',
  warning => {

    console.warn(
      '⚠️ Discord warning:',
      warning
    );

  }
);


// ========================================
// STARTUP
// ========================================

async function startBot() {

  const startupId =
    createRoutineCheckId();

  log(
    startupId,
    'STARTUP',
    'Starting bot...'
  );

  try {

    await measureStep(

      startupId,

      'MongoDB',

      'Connect',

      () =>
        mongoClient.connect()

    );

    log(
      startupId,
      'MongoDB',
      'Connected'
    );

    const database =
      mongoClient.db(
        'linkbot'
      );

    linksCollection =
      database.collection(
        'links'
      );

    routineSentCollection =
      database.collection(
        'routineSent'
      );

    log(
      startupId,
      'MongoDB',
      'Collections loaded'
    );

    log(
      startupId,
      'Discord',
      `Token present: ${Boolean(process.env.DISCORD_TOKEN)}`
    );

    await measureStep(

      startupId,

      'Discord',

      'Login',

      async () => {

        const loginResult =
          await client.login(
            process.env.DISCORD_TOKEN
          );

        log(
          startupId,
          'Discord',
          `Login result: ${loginResult}`
        );

      }

    );

    log(
      startupId,
      'STARTUP',
      'Startup completed'
    );

  }

  catch (error) {

    logError(

      startupId,

      'STARTUP',

      'Startup failed',

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


// ========================================
// READY EVENT
// ========================================

client.once(
  'ready',
  async () => {

    const readyId =
      createRoutineCheckId();

    log(
      readyId,
      'READY',
      `Logged in as ${client.user.tag}`
    );

    try {

      const rest =
        new REST({
          version: '10'
        }).setToken(
          process.env.DISCORD_TOKEN
        );

      await measureStep(

        readyId,

        'SlashCommands',

        'Register',

        () =>

          rest.put(

            Routes.applicationCommands(
              client.user.id
            ),

            {
              body: commands
            }

          )

      );

      log(
        readyId,
        'SlashCommands',
        'Registered'
      );

      startWeatherScheduler();

      startRoutineScheduler();

      log(
        readyId,
        'READY',
        'Schedulers started'
      );

    }

    catch (error) {

      logError(

        readyId,

        'READY',

        'Initialization failed',

        error

      );

    }

  }

);


// ========================================
// START
// ========================================

startBot();
