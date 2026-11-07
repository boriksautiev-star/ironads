const cron = require('node-cron');
const { exec } = require('child_process');

cron.schedule('0 3 * * *', () => {
  console.log('🔄 Запуск генерации sitemap...');
  exec('node generate-sitemap.js', (err, stdout, stderr) => {
    if (err) console.error('❌ Ошибка:', err);
    else console.log(stdout);
  });
});

console.log('✅ Sitemap cron запущен, будет выполняться каждый день в 3:00');