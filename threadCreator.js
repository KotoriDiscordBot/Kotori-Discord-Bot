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

  // Schedule it to run every day at 18:00 Argentina time
  const job = schedule.scheduleJob({ rule: '0 0 18 * * *', tz: 'America/Argentina/Buenos_Aires' }, async () => {
    try {
      // === THREAD 1 ===
      const channel1 = await client.channels.fetch('1369526757673144391');
      const message1 = await channel1.messages.fetch('1397107841218908323');
      await message1.startThread({
        name: 'Primera hora',
        autoArchiveDuration: 10080
      });

      // === THREAD 2 ===
      const channel2 = await client.channels.fetch('1369526825386246206');
      const message2 = await channel2.messages.fetch('1397107892414320710');
      await message2.startThread({
        name: 'Segunda hora',
        autoArchiveDuration: 10080
      });

      // === THREAD 3 ===
      const channel3 = await client.channels.fetch('1369526941282996284');
      const message3 = await channel3.messages.fetch('1397107962048417842');
      await message3.startThread({
        name: 'Tercera hora',
        autoArchiveDuration: 10080
      });

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
};
