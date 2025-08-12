const schedule = require('node-schedule');
const moment = require('moment-timezone');

module.exports = async function setupSchedules(client) {
  console.log('🕒 Setting up scheduled jobs...');

  // === DAILY RAID THREADS at 18:00 ===
  try {
    schedule.scheduleJob({ rule: '0 0 18 * * *', tz: 'America/Argentina/Buenos_Aires' }, async () => {
      try {
        const notifyChannel = await client.channels.fetch('1208444259653521531');
        const threadConfigs = [
          { id: '1369526757673144391', name: 'Primera hora', reason: 'Daily raid thread 1' },
          { id: '1369526825386246206', name: 'Segunda hora', reason: 'Daily raid thread 2' },
          { id: '1369526941282996284', name: 'Tercera hora', reason: 'Daily raid thread 3' }
        ];

        let createdThreads = [];

        for (const config of threadConfigs) {
          const channel = await client.channels.fetch(config.id);
          const messages = await channel.messages.fetch({ limit: 1 });

          if (!messages.size) {
            console.log(`⚠️ No messages found in channel ${config.id}, skipping thread creation.`);
            continue;
          }

          const lastMessage = messages.first();
          const thread = await lastMessage.startThread({
            name: config.name,
            autoArchiveDuration: 10080,
            reason: config.reason,
          });

          await thread.send('+1');
          createdThreads.push(config.name);
        }

        if (createdThreads.length) {
          await notifyChannel.send({
            content: 'Listas de raid abiertas @everyone',
            allowedMentions: { parse: ['everyone'] }
          });
          console.log(`[${new Date().toLocaleString()}] ✅ Created threads: ${createdThreads.join(', ')}. Notification sent.`);
        } else {
          console.log(`[${new Date().toLocaleString()}] ❌ No threads created. Nothing to notify.`);
        }
      } catch (error) {
        console.error(`[${new Date().toLocaleString()}] ❌ Error in 18:00 scheduled job:`, error);
      }
    });
    console.log('🕒 Daily raid thread job scheduled for 18:00 Buenos Aires time.');
  } catch (err) {
    console.error('❌ Failed to schedule daily raid threads job:', err);
  }

  // === CONFIRMATION AT 17:50 ===
  try {
    schedule.scheduleJob({ rule: '0 50 17 * * *', tz: 'America/Argentina/Buenos_Aires' }, async () => {
      try {
        const confirmChannel = await client.channels.fetch('1397497912421908500');
        const embed = {
          description: 'El bot de Kotori continúa activo y preparado para abrir listas de raids dentro de 10 minutos 👑',
          color: 0xff46da,
        };
        await confirmChannel.send({ embeds: [embed] });
        console.log(`[${new Date().toLocaleString()}] 🔄 Confirmación 17:50 enviada con embed.`);
      } catch (error) {
        console.error(`[${new Date().toLocaleString()}] ⚠️ Error al enviar confirmación 17:50:`, error);
      }
    });
    console.log('🕒 Confirmation message scheduled for 17:50 Buenos Aires time.');
  } catch (err) {
    console.error('❌ Failed to schedule 17:50 confirmation message:', err);
  }

  // === CONFIRMATION MESSAGES ===
  const confirmationTimes = [6, 10, 14, 17];
  const confirmationChannelId = '1397497912421908500';

  for (const hour of confirmationTimes) {
    try {
      schedule.scheduleJob({ rule: `0 0 ${hour} * * *`, tz: 'America/Argentina/Buenos_Aires' }, async () => {
        try {
          const channel = await client.channels.fetch(confirmationChannelId);
          await channel.send('El bot de Kotori se encuentra funcionando correctamente ✨');
          console.log(`[${new Date().toLocaleString()}] ✅ Confirmation message sent at ${hour}:00`);
        } catch (error) {
          console.error(`[${new Date().toLocaleString()}] ❌ Error sending confirmation at ${hour}:00:`, error);
        }
      });
      console.log(`🕒 Confirmation message scheduled for ${hour}:00 Buenos Aires time.`);
    } catch (err) {
      console.error(`❌ Failed to schedule confirmation message at ${hour}:00:`, err);
    }
  }

  console.log('🕒 All scheduled jobs set up.');
};


