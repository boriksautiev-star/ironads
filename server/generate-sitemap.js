// generate-sitemap.js – Генерация динамического sitemap.xml
const fs = require('fs');
const path = require('path');
const pool = require('./db/pool');

const SITEMAP_PATH = path.join(__dirname, 'public', 'sitemap.xml');
const BASE_URL = 'https://ironads.ru';

// Дата последнего изменения (сегодня)
const today = new Date().toISOString().split('T')[0];

// Основные статические страницы
const staticPages = [
  { loc: '/', priority: 1.0, changefreq: 'daily' },
  { loc: '/blog.html', priority: 0.8, changefreq: 'weekly' },
  { loc: '/blog/bezopasnost-prodazh.html', priority: 0.7, changefreq: 'monthly' },
  { loc: '/blog/kak-fotografirovat.html', priority: 0.7, changefreq: 'monthly' },
  { loc: '/blog/5-oshibok.html', priority: 0.7, changefreq: 'monthly' },
  { loc: '/contact.html', priority: 0.6, changefreq: 'monthly' },
  { loc: '/terms.html', priority: 0.5, changefreq: 'yearly' },
  { loc: '/privacy.html', priority: 0.5, changefreq: 'yearly' },
  { loc: '/offer.html', priority: 0.5, changefreq: 'yearly' },
  { loc: '/user-guide.html', priority: 0.6, changefreq: 'monthly' },
  { loc: '/admin-guide.html', priority: 0.4, changefreq: 'monthly' },
];

// Генерация sitemap
async function generateSitemap() {
  console.log('🔄 Генерация sitemap...');

  try {
    // 1. Получаем все активные объявления (используем created_at)
    const listingsRes = await pool.query(`
      SELECT id, created_at
      FROM listings
      WHERE deleted_at IS NULL
        AND (status = 'active' OR status IS NULL)
    `);
    const listings = listingsRes.rows;

    // 2. Получаем все активные категории (используем created_at)
    const categoriesRes = await pool.query(`
      SELECT id, name, slug, created_at
      FROM categories
      WHERE is_active = true
    `);
    const categories = categoriesRes.rows;

    // 3. Получаем все города
    const citiesRes = await pool.query(`
      SELECT id, name
      FROM cities
    `);
    const cities = citiesRes.rows;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Статические страницы
    for (const page of staticPages) {
      xml += `  <url>\n`;
      xml += `    <loc>${BASE_URL}${page.loc}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += `  </url>\n`;
    }

    // Объявления
    for (const listing of listings) {
      const lastmod = listing.created_at ? listing.created_at.toISOString().split('T')[0] : today;
      xml += `  <url>\n`;
      xml += `    <loc>${BASE_URL}/listing.html?id=${listing.id}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;
      xml += `  </url>\n`;
    }

    // Категории
    for (const cat of categories) {
      const lastmod = cat.created_at ? cat.created_at.toISOString().split('T')[0] : today;
      xml += `  <url>\n`;
      xml += `    <loc>${BASE_URL}/?category_id=${cat.id}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    }

    // Города (транслитерация упрощённая)
    const translitMap = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
      'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
      ' ': '-', ',': '', '.': '', '!': '', '?': ''
    };
    function slugify(text) {
      text = text.toLowerCase().trim();
      let result = '';
      for (const char of text) {
        result += translitMap[char] || char;
      }
      result = result.replace(/-+/g, '-').replace(/^-|-$/g, '');
      return result;
    }

    for (const city of cities) {
      const slug = slugify(city.name);
      if (!slug) continue;
      xml += `  <url>\n`;
      xml += `    <loc>${BASE_URL}/city/${slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.6</priority>\n`;
      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
    console.log(`✅ Sitemap сохранён: ${SITEMAP_PATH}`);
    console.log(`   Всего URL: ${staticPages.length + listings.length + categories.length + cities.length}`);

  } catch (err) {
    console.error('❌ Ошибка генерации sitemap:', err);
  } finally {
    await pool.end();
  }
}

generateSitemap();