import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { fal } from "@fal-ai/client";
import Replicate from 'replicate';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { config } from './config.js';
import convert from 'heic-convert';
import sharp from 'sharp';
import { exiftool } from 'exiftool-vendored';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.FAL_KEY) {
    console.error('ERROR: FAL_KEY not found in .env file');
    process.exit(1);
}

if (!process.env.REPLICATE_API_TOKEN) {
    console.error('ERROR: REPLICATE_API_TOKEN not found in .env file');
    process.exit(1);
}

fal.config({ credentials: process.env.FAL_KEY });
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const app = express();
const PORT = config.port;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.use('/uploads', express.static(join(__dirname, 'uploads')));
app.use('/gen-images', express.static(join(__dirname, 'gen-images')));
app.use('/placeholders', express.static(join(__dirname, 'placeholders')));

const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: config.max_file_size }
});

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Cloudflare R2 Setup
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

// Upload image to Cloudflare R2
async function uploadToR2(buffer, filename) {
    try {
        console.log('Uploading to R2:', filename);

        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: filename,
            Body: buffer,
            ContentType: 'image/png',
        });

        await s3Client.send(command);

        // R2 public URL
        const publicUrl = `${R2_PUBLIC_URL}/${filename}`;

        console.log('✅ Uploaded to R2:', publicUrl);
        return publicUrl;
    } catch (error) {
        console.error('❌ Error uploading to R2:', error);
        throw error;
    }
}

// Delete image from Cloudflare R2
async function deleteFromR2(filename) {
    try {
        console.log('Deleting from R2:', filename);

        const command = new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: filename,
        });

        await s3Client.send(command);
        console.log('✅ Deleted from R2:', filename);
    } catch (error) {
        console.error('❌ Error deleting from R2:', error);
        throw error;
    }
}

// Cache für GeoJSON Daten
let quartierData = null;

async function loadQuartierData() {
    if (quartierData) return quartierData;
    
    try {
        console.log('Loading Basel Quartier data...');
        const response = await fetch('https://data.bs.ch/api/v2/catalog/datasets/100042/exports/geojson');
        quartierData = await response.json();
        console.log('Quartier data loaded successfully');
        
        // Debug: Show structure and first feature
        if (quartierData.features && quartierData.features.length > 0) {
            console.log('Total features:', quartierData.features.length);
            console.log('First feature geometry type:', quartierData.features[0].geometry.type);
            console.log('First feature properties:', JSON.stringify(quartierData.features[0].properties, null, 2));
            
            // Test mit deinen bekannten Koordinaten
            const testResult = findQuartier(47.564506, 7.583597);
            console.log('TEST: Quartier for 47.564506, 7.583597:', testResult);
        }
        
        return quartierData;
    } catch (error) {
        console.error('Error loading quartier data:', error);
        return null;
    }
}

// Point-in-Polygon Test
function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        
        if (intersect) inside = !inside;
    }
    
    return inside;
}

// Verbesserte findQuartier Funktion mit besserer Fehlerbehandlung
function findQuartier(lat, lon) {
    if (!quartierData) {
        console.error('❌ quartierData is null!');
        return { name: 'Ausserhalb Basel', nummer: 20, label: 'Ausserhalb Basel' };
    }
    
    console.log('🔍 Searching quartier for coordinates:', { lat, lon });
    
    const point = [lon, lat]; // GeoJSON verwendet [longitude, latitude]
    
    let checkedFeatures = 0;
    
    for (const feature of quartierData.features) {
        checkedFeatures++;
        const geometry = feature.geometry;
        const properties = feature.properties;
        
        if (geometry.type === 'Polygon') {
            const outerRing = geometry.coordinates[0];
            const isInside = pointInPolygon(point, outerRing);
            
            if (checkedFeatures <= 3) {
                console.log(`  Feature ${checkedFeatures} (${properties.wov_name}): ${isInside ? 'MATCH!' : 'no match'}`);
            }
            
            if (isInside) {
                console.log('✅ Found in polygon!');
                console.log('   Properties:', properties);
                
                // WICHTIG: Stelle sicher, dass nummer eine Zahl ist
                const nummer = parseInt(properties.wov_id) || 20;
                
                return {
                    name: properties.wov_name || 'Ausserhalb Basel',
                    nummer: nummer,
                    label: properties.wov_label || properties.wov_name || 'Ausserhalb Basel'
                };
            }
        } else if (geometry.type === 'MultiPolygon') {
            for (const polygon of geometry.coordinates) {
                const outerRing = polygon[0];
                const isInside = pointInPolygon(point, outerRing);
                
                if (isInside) {
                    console.log('✅ Found in multipolygon!');
                    console.log('   Properties:', properties);
                    
                    // WICHTIG: Stelle sicher, dass nummer eine Zahl ist
                    const nummer = parseInt(properties.wov_id) || 20;
                    
                    return {
                        name: properties.wov_name || 'Ausserhalb Basel',
                        nummer: nummer,
                        label: properties.wov_label || properties.wov_name || 'Ausserhalb Basel'
                    };
                }
            }
        }
    }
    
    console.log(`❌ No matching quartier found (checked ${checkedFeatures} features)`);
    return { name: 'Ausserhalb Basel', nummer: 20, label: 'Ausserhalb Basel' };
}

async function extractGPSFromImage(filePath) {
    try {
        console.log('Extracting GPS metadata from:', filePath);

        const metadata = await exiftool.read(filePath);

        const lat = metadata.GPSLatitude;
        const lon = metadata.GPSLongitude;

        if (!lat || !lon) {
            console.log('No GPS data found in image');
            return null;
        }

        console.log('GPS found:', { lat, lon });
        return { lat, lon };

    } catch (error) {
        console.log('Error extracting GPS:', error.message);
        return null;
    }
}

// HEIC conversion function - returns object with path and filename
async function convertHeicIfNeeded(filePath, originalFilename) {
    console.log('=== HEIC Conversion Check ===');
    console.log('File path:', filePath);
    console.log('Original filename:', originalFilename);
    
    if (!fs.existsSync(filePath)) {
        console.error('File does not exist:', filePath);
        throw new Error('File not found');
    }
    
    const ext = filePath.toLowerCase().split('.').pop();
    const origExt = originalFilename ? originalFilename.toLowerCase().split('.').pop() : ext;
    console.log('File extension:', ext);
    console.log('Original extension:', origExt);
    
    // Check both the file path AND original filename for HEIC
    if (ext === 'heic' || ext === 'heif' || origExt === 'heic' || origExt === 'heif') {
        console.log('HEIC file detected, starting conversion...');
        try {
            const inputBuffer = fs.readFileSync(filePath);
            console.log('Input buffer size:', inputBuffer.length);
            
            const outputBuffer = await convert({
                buffer: inputBuffer,
                format: 'JPEG',
                quality: 0.9
            });
            
            console.log('Conversion successful, output buffer size:', outputBuffer.length);
            
            // Save converted file with .jpg extension
            const convertedPath = filePath.replace(/\.(heic|heif)?$/i, '') + '.jpg';
            fs.writeFileSync(convertedPath, outputBuffer);
            
            console.log('HEIC converted and saved to:', convertedPath);
            
            // Verify converted file exists
            if (!fs.existsSync(convertedPath)) {
                throw new Error('Converted file was not created');
            }
            
            const convertedStats = fs.statSync(convertedPath);
            console.log('Converted file size:', convertedStats.size);
            
            // Delete original HEIC file
            fs.unlinkSync(filePath);
            console.log('Original HEIC file deleted');
            
            // Update filename to .jpg
            const convertedFilename = originalFilename 
                ? originalFilename.replace(/\.(heic|heif)$/i, '.jpg')
                : 'image.jpg';
            
            console.log('Converted filename:', convertedFilename);
            console.log('=== HEIC Conversion Complete ===');
            
            return {
                path: convertedPath,
                filename: convertedFilename
            };
        } catch (error) {
            console.error('Error converting HEIC:', error);
            console.error('Error stack:', error.stack);
            throw new Error(`Failed to convert HEIC image: ${error.message}`);
        }
    }
    
    console.log('No conversion needed');
    return {
        path: filePath,
        filename: originalFilename || filePath.split('/').pop() || 'image.png'
    };
}

async function uploadImageToFal(filePath, filename) {
    console.log('=== uploadImageToFal START ===');
    console.log('Input filePath:', filePath);
    console.log('Filename:', filename);
    
    const fileBuffer = fs.readFileSync(filePath);
    console.log('File buffer size:', fileBuffer.length);
    
    // Ensure filename has extension
    if (!filename.includes('.')) {
        filename += '.jpg';
    }
    
    console.log('Final filename for upload:', filename);
    
    const ext = filename.toLowerCase().split('.').pop();
    const contentType = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif',
    }[ext] || 'image/jpeg';
    
    console.log('Content type:', contentType);
    
    const file = new File([fileBuffer], filename, { type: contentType });
    console.log('File object created, uploading to FAL...');
    
    const uploadedUrl = await fal.storage.upload(file);
    console.log('Upload successful! URL:', uploadedUrl);
    console.log('=== uploadImageToFal END ===');
    
    return uploadedUrl;
}

async function analyzeImageWithGemini(filePath) {
    try {
        console.log('Analyzing image with Gemini 2.5 Flash...');
        console.log('Local file path:', filePath);
        
        // Read the file
        const fileBuffer = fs.readFileSync(filePath);
        
        // Detect mime type
        const ext = filePath.toLowerCase().split('.').pop();
        const mimeType = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'gif': 'image/gif'
        }[ext] || 'image/jpeg';
        
        // Create a proper File object with correct type
        const fileName = `image.${ext || 'jpg'}`;
        const file = new File([fileBuffer], fileName, { type: mimeType });
        
        // Upload file using Replicate's file API
        console.log('Uploading file to Replicate...');
        const fileUpload = await replicate.files.create(file);
        const fileUrl = fileUpload.urls.get;
        
        const geminiPrompt = config.geminiPrompt;
        
        const input = {
            images: [fileUrl],
            prompt: geminiPrompt
        };
        
        console.log('Sending to Gemini with input:', JSON.stringify(input, null, 2));
        
        // Stream the response
        let fullResponse = '';
        for await (const event of replicate.stream("google/gemini-2.5-flash", { input })) {
            fullResponse += event.toString();
        }
        
        const result = fullResponse.trim();
        
        if (!result || result === '' || result.toLowerCase() === 'nothing') {
            console.warn('Gemini returned empty or invalid result, using fallback');
            return 'object';
        }
        
        // Extract just the first word and clean it
        const oneWord = result.split(/\s+/)[0]
            .replace(/[.,!?;:'"]/g, '')
            .toLowerCase();
        
        console.log('Gemini analysis:', oneWord);
        return oneWord;
    } catch (error) {
        console.error('Error analyzing image:', error);
        console.error('Error details:', error.message);
        if (error.response) {
            console.error('API response:', error.response);
        }
        return 'object';
    }
}

// Endpunkt zum Laden der Bildpositionen
app.get('/api/positions', (req, res) => {
    try {
        const positionsPath = join(__dirname, 'image-positions.json');
        if (fs.existsSync(positionsPath)) {
            const data = fs.readFileSync(positionsPath, 'utf8');
            res.json(JSON.parse(data));
        } else {
            res.json({ images: [] });
        }
    } catch (error) {
        console.error('Error loading positions:', error);
        res.status(500).json({ error: 'Failed to load positions' });
    }
});

// Endpunkt zum Speichern der Bildpositionen
app.post('/api/positions', (req, res) => {
    try {
        const positionsPath = join(__dirname, 'image-positions.json');
        fs.writeFileSync(positionsPath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving positions:', error);
        res.status(500).json({ error: 'Failed to save positions' });
    }
});

// Endpunkt zum Löschen eines Bildes
app.post('/api/delete-image', async (req, res) => {
    try {
        const { imageUrl } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ error: 'No image URL provided' });
        }

        console.log('Deleting image:', imageUrl);

        // Check if it's an R2 URL
        if (imageUrl.includes('.r2.dev/') || imageUrl.includes('.r2.cloudflarestorage.com/')) {
            // Extract filename from R2 URL
            const filename = imageUrl.split('/').pop();
            await deleteFromR2(filename);
        } else {
            // Delete local file (for backwards compatibility)
            const imagePath = join(__dirname, 'public', imageUrl);
            const altImagePath = join(__dirname, imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl);

            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log('Deleted file:', imagePath);
            } else if (fs.existsSync(altImagePath)) {
                fs.unlinkSync(altImagePath);
                console.log('Deleted file:', altImagePath);
            } else {
                console.log('File not found, but continuing to update positions');
            }
        }

        // Remove from image-positions.json
        const positionsPath = join(__dirname, 'image-positions.json');
        if (fs.existsSync(positionsPath)) {
            const data = JSON.parse(fs.readFileSync(positionsPath, 'utf8'));
            const originalLength = data.images.length;
            data.images = data.images.filter(img => img.imageUrl !== imageUrl);
            fs.writeFileSync(positionsPath, JSON.stringify(data, null, 2));
            console.log(`Removed from positions: ${originalLength} -> ${data.images.length}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

app.post('/api/generate', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
    }
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let processedFile = {
        path: req.file.path,
        filename: req.file.originalname
    };
    
    try {
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: 5, message: 'Processing image...' })}\n\n`);
        
        // Load quartier data
        await loadQuartierData();

        // Extract GPS before conversion (in case HEIC has GPS data)
        const gps = await extractGPSFromImage(req.file.path);
        let quartier = null;

        if (gps) {
            quartier = findQuartier(gps.lat, gps.lon);
            console.log('📍 GPS detected - Quartier result:', JSON.stringify(quartier, null, 2));

            // Validiere die Quartier-Daten
            if (!quartier || !quartier.nummer || quartier.nummer < 1 || quartier.nummer > 20) {
                console.warn('⚠️ Invalid quartier data, using fallback');
                quartier = { name: 'Ausserhalb Basel', nummer: 20, label: 'Ausserhalb Basel' };
            }
        } else {
            console.log('📍 No GPS data found - using fallback Quartier 20');
            quartier = { name: 'Ausserhalb Basel', nummer: 20, label: 'Ausserhalb Basel' };
        }

        // Stelle nochmal sicher, dass nummer eine Zahl ist
        quartier.nummer = parseInt(quartier.nummer);

        console.log('✅ Final quartier data to be sent:', JSON.stringify(quartier, null, 2));
        
        // Convert HEIC if needed - returns {path, filename}
        processedFile = await convertHeicIfNeeded(req.file.path, req.file.originalname);
        console.log('Processed file:', processedFile);
        
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: 10, message: 'Analyzing image with Gemini...' })}\n\n`);
        
        // Analyze image with Gemini using the processed file
        const detectedObject = await analyzeImageWithGemini(processedFile.path);
        
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: 30, message: `Detected: ${detectedObject}` })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'progress', progress: 40, message: 'Uploading image to FAL...' })}\n\n`);
        
        // Upload to FAL with correct filename
        const uploadedImageUrl = await uploadImageToFal(processedFile.path, processedFile.filename);
        console.log('Uploaded image to FAL:', uploadedImageUrl);

        res.write(`data: ${JSON.stringify({ type: 'progress', progress: 60, message: 'Starting generation...' })}\n\n`);

        const dynamicPrompt = `${config.prompt}. Focus on the ${detectedObject}.`;
        
        const workflowInput = {
            text_field: detectedObject,
            guidance_scale: config.guidance_scale,
            prompt: dynamicPrompt,
            main_image: uploadedImageUrl,
            lora_scale: config.lora_scale,
            lora_path: config.lora_path
        };
        
        console.log('Workflow input:', JSON.stringify(workflowInput, null, 2));

        const stream = await fal.stream(config.workflow_id, {
            input: workflowInput
        });
       
        let progress = 70;
        for await (const event of stream) {
            if (event.type === 'error') {
                const errorMsg = event.error?.body?.detail
                    ? JSON.stringify(event.error.body.detail)
                    : (event.message || 'Unknown error');
                console.error('Workflow error:', errorMsg);

                // Send user-friendly error message
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: `"${detectedObject}" zu komplex. Bitte nochmals probieren.`
                })}\n\n`);
                res.end();

                // Clean up
                if (processedFile && fs.existsSync(processedFile.path)) {
                    fs.unlinkSync(processedFile.path);
                }
                return;
            }
            progress = Math.min(progress + 10, 90);
            res.write(`data: ${JSON.stringify({ type: 'progress', progress, message: 'Generating image...' })}\n\n`);
        }
        
        const result = await stream.done();
        
        // Extract image URL from result
        let imageUrl = null;

        if (result) {
            imageUrl = result.output?.image?.url || 
                       result.output?.image?.[0]?.url || result.output?.image?.[0] ||
                       result.image?.[0]?.url || result.image?.[0] || 
                       result.image?.url || result.image || 
                       result.url || (typeof result === 'string' ? result : null);
        }
        
        if (!imageUrl) {
            console.error('Unexpected result format:', result);
            throw new Error('No image URL in result');
        }
        
        console.log('Generated image URL:', imageUrl);
        
        // Download and save the generated image
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();

        // Format: YY-MM-DD-HH-MM-SS
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const filename = `generated-${yy}-${mm}-${dd}-${hh}-${min}-${ss}.png`;

        res.write(`data: ${JSON.stringify({ type: 'progress', progress: 95, message: 'Uploading to R2...' })}\n\n`);

        // Upload to Cloudflare R2
        const r2ImageUrl = await uploadToR2(Buffer.from(imageBuffer), filename);

        // WICHTIG: Sende quartier-Daten mit validierter Struktur
        const resultData = {
            type: 'result',
            imageUrl: r2ImageUrl,
            detectedObject: detectedObject,
            quartier: {
                name: quartier.name,
                nummer: quartier.nummer,  // Sollte immer eine Zahl zwischen 1-20 sein
                label: quartier.label
            },
            gps: gps || null  // GPS-Koordinaten hinzufügen (falls vorhanden)
        };

        console.log('📤 Sending result to frontend:', JSON.stringify(resultData, null, 2));
        res.write(`data: ${JSON.stringify(resultData)}\n\n`);
        res.end();
        
        // Clean up uploaded/processed file
        if (fs.existsSync(processedFile.path)) {
            fs.unlinkSync(processedFile.path);
        }
    } catch (error) {
        console.error('Error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        res.end();
        
        // Clean up on error
        if (fs.existsSync(processedFile.path)) {
            fs.unlinkSync(processedFile.path);
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`FAL_KEY loaded: ${process.env.FAL_KEY ? '✓' : '✗'}`);
    console.log(`REPLICATE_API_TOKEN loaded: ${process.env.REPLICATE_API_TOKEN ? '✓' : '✗'}`);
});

// Cleanup exiftool on exit
process.on('exit', () => {
    exiftool.end();
});