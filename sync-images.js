import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lade existierende JSON
const jsonPath = join(__dirname, 'image-positions.json');
const genImagesDir = join(__dirname, 'gen-images');

let data = { images: [] };
if (fs.existsSync(jsonPath)) {
    const content = fs.readFileSync(jsonPath, 'utf8');
    data = JSON.parse(content);
}

console.log(`📊 Current images in JSON: ${data.images.length}`);

// Sammle alle URLs die bereits in JSON sind
const existingUrls = new Set(data.images.map(img => img.imageUrl));

// Scanne gen-images Ordner
const files = fs.readdirSync(genImagesDir);
const imageFiles = files.filter(file =>
    file.toLowerCase().endsWith('.png') ||
    file.toLowerCase().endsWith('.jpg') ||
    file.toLowerCase().endsWith('.jpeg')
);

console.log(`📂 Total images in folder: ${imageFiles.length}`);

let addedCount = 0;
let zIndex = 1620; // Start von einem hohen Wert

// Füge fehlende Bilder hinzu
for (const file of imageFiles) {
    const url = `/gen-images/${file}`;

    if (!existingUrls.has(url)) {
        // Neues Bild - füge hinzu mit Standardwerten
        data.images.push({
            imageUrl: url,
            caption: "object",
            quartierId: 20,
            x: 0,
            y: 0,
            scale: 1,
            zIndex: zIndex++
        });
        addedCount++;
    }
}

console.log(`✅ Added ${addedCount} new images`);
console.log(`📊 Total images now: ${data.images.length}`);

// Speichere aktualisierte JSON
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
console.log('💾 Saved to image-positions.json');
