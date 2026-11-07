const { generateFeed } = require('../routes/feed');

async function updateFeed() {
    try {
        await generateFeed();
        console.log('✅ Фид обновлён по расписанию');
    } catch (err) {
        console.error('❌ Ошибка обновления фида:', err);
    }
}

if (require.main === module) {
    updateFeed();
}

module.exports = updateFeed;