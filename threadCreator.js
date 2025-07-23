const schedule = require('node-schedule');
const moment = require('moment-timezone');

module.exports = function setupSchedules(client) {
  // Helper: Get next 18:00 in Buenos Aires
  function getNextRunDate() {
    return moment.tz('America/Argentina/Buenos_Aires')
      .set({ hour: 18, minute: 0, second: 0, millisecond: 0 })
      .add(moment().tz('America/Argentina/Buenos_Aires').hour() >= 18 ? 1 : 0, 'day')
      .toDate();
  }

  // === MAIN DAILY JOB ===
const job = schedule.scheduleJob({ rule: '0 0 18 * * *', tz: 'America/Argentina/Buenos_Aires' }, async () => {
  try {
    const notifyChannel = await client.channels.fetch('1208444259653521531');
    const threadConfigs = [
      { id: '1369526757673144391', name: 'Primera hora', reason: 'Daily raid thread 1' },
      { id: '1369526825386246206', name: 'Segunda hora', reason: 'Daily raid thread 2' },
      { id: '1369526941282996284', name: 'Tercera hora', reason: 'Daily raid thread 3' }
    ];

    let anyThreadCreated = false;

    for (const config of threadConfigs) {
      const channel = await client.channels.fetch(config.id);
      const messages = await channel.messages.fetch({ limit: 1 });

      if (!messages.size) continue; // Skip if there are no messages

      const lastMessage = messages.first();
      const thread = await lastMessage.startThread({
        name: config.name,
        autoArchiveDuration: 10080,
        reason: config.reason,
      });

      await thread.send('+1');
      anyThreadCreated = true;
    }

    if (anyThreadCreated) {
      await notifyChannel.send({
        content: 'Listas de raid abiertas @everyone',
        allowedMentions: { parse: ['everyone'] }
      });
    }

    console.log(`[${new Date().toLocaleString()}] ✅ Threads checked/created and notify sent (if needed).`);
  } catch (error) {
    console.error(`[${new Date().toLocaleString()}] ❌ Error during schedule:`, error);
  }
});

console.log(`🕒 Daily job scheduled for 18:00 Buenos Aires time.`);

// Confirm the bot is alive at 17:50 with embed
schedule.scheduleJob({ rule: '0 50 17 * * *', tz: 'America/Argentina/Buenos_Aires' }, async () => {
  try {
    const confirmChannel = await client.channels.fetch('1397497912421908500');
    const embed = {
      description: 'El bot de Kotori continúa activo y preparado para abrir listas de raids dentro de 10 minutos 👑',
      color: 0xff46da, // This is the hex code in decimal
    };
    await confirmChannel.send({ embeds: [embed] });
    console.log(`[${new Date().toLocaleString()}] 🔄 Confirmación 17:50 enviada con embed.`);
  } catch (error) {
    console.error(`[${new Date().toLocaleString()}] ⚠️ Error al enviar confirmación 17:50:`, error);
  }
});

  // === CONFIRMATION MESSAGES ===
  const confirmationTimes = [6, 10, 14, 17];
  const confirmationChannelId = '1397497912421908500';

  for (const hour of confirmationTimes) {
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
  }
};


