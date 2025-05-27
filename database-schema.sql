-- Cek jumlah halaman yang sudah di-scrape
SELECT COUNT(*) FROM visits;

-- Lihat 5 data terbaru
SELECT url, title, visit_time FROM visits ORDER BY visit_time DESC LIMIT 5;

-- Cari halaman yang mengandung kata 'tutorial'
SELECT v.url, v.title, pc.parsed_text
FROM visits v
JOIN page_content pc ON v.id = pc.visit_id
WHERE pc.parsed_text LIKE '%tutorial%'
ORDER BY v.visit_time DESC
LIMIT 10;
