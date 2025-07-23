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
      // === THREAD 1 ===
      const channel1 = await client.channels.fetch('1369526757673144391');
      const thread1 = await channel1.threads.create({
        name: 'Primera hora',
        autoArchiveDuration: 10080,
        reason: 'Daily raid thread 1',
      });
      await thread1.send('+1');

      // === THREAD 2 ===
      const channel2 = await client.channels.fetch('1369526825386246206');
      const thread2 = await channel2.threads.create({
        name: 'Segunda hora',
        autoArchiveDuration: 10080,
        reason: 'Daily raid thread 2',
      });
      await thread2.send('+1');

      // === THREAD 3 ===
      const channel3 = await client.channels.fetch('1369526941282996284');
      const thread3 = await channel3.threads.create({
        name: 'Tercera hora',
        autoArchiveDuration: 10080,
        reason: 'Daily raid thread 3',
      });
      await thread3.send('+1');

      // === NOTIFY MESSAGE ===
      const notifyChannel = await client.channels.fetch('1208444259653521531');
      await notifyChannel.send({
        content: 'Listas de raid abiertas @everyone',
        allowedMentions: { parse: ['everyone'] }
      });

      console.log(`[${new Date().toLocaleString()}] ✅ Threads created and message sent.`);
    } catch (error) {
      console.error(`[${new Date().toLocaleString()}] ❌ Error during schedule:`, error);
    }
  });

  console.log(`🕒 Daily job scheduled for 18:00 Buenos Aires time.`);

  // === CONFIRMATION MESSAGES ===
  const confirmationTimes = [6, 14, 17];
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


