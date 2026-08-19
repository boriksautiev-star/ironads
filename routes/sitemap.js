const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'ironads',
    password: process.env.DB_PASSWORD || 'Sautievshau22$',
    port: 5432,
});

// Маршрут для sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
    try {
        // Получаем все уникальные города из объявлений
        const citiesResult = await pool.query(
            `SELECT DISTINCT city FROM listings WHERE city IS NOT NULL AND city != ''`
        );
        // Получаем последние 1000 объявлений (можно увеличить)
        const listingsResult = await pool.query(
            `SELECT id, updated_at FROM listings ORDER BY updated_at DESC LIMIT 1000`
        );

        const today = new Date().toISOString().split('T')[0];
        let urls = `
            <url>
                <loc>https://ironads.ru/</loc>
                <lastmod>${today}</lastmod>
                <changefreq>daily</changefreq>
                <priority>1.0</priority>
            </url>
            <url>
                <loc>https://ironads.ru/listings</loc>
                <lastmod>${today}</lastmod>
                <changefreq>daily</changefreq>
                <priority>0.9</priority>
            </url>
        `;

        // Добавляем страницы городов
        citiesResult.rows.forEach(row => {
            if (row.city) {
                // Преобразуем название города в slug
                const slug = row.city.toLowerCase()
                    .replace(/[^a-zа-яё0-9]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');
                const cityUrl = `https://ironads.ru/city/${encodeURIComponent(slug)}`;
                urls += `
                    <url>
                        <loc>${cityUrl}</loc>
                        <lastmod>${today}</lastmod>
                        <changefreq>weekly</changefreq>
                        <priority>0.8</priority>
                    </url>
                `;
            }
        });

        // Добавляем страницы объявлений
        listingsResult.rows.forEach(row => {
            const lastmod = row.updated_at ? row.updated_at.toISOString().split('T')[0] : today;
            urls += `
                <url>
                    <loc>https://ironads.ru/listing.html?id=${row.id}</loc>
                    <lastmod>${lastmod}</lastmod>
                    <changefreq>weekly</changefreq>
                    <priority>0.6</priority>
                </url>
            `;
        });

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
</urlset>`;

        res.header('Content-Type', 'application/xml');
        res.send(sitemap);
    } catch (err) {
        console.error('❌ Ошибка генерации sitemap:', err.message);
        res.status(500).send('Ошибка генерации sitemap');
    }
});

module.exports = router;