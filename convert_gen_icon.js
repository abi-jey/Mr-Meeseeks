const sharp = require('sharp');
const path = require('path');

// Update this path to the generated image
const inputPath = '/home/abja/.gemini/antigravity/brain/8691a086-5d6b-49e5-80fd-e76ceb8e1c1f/mr_meeseeks_waving_1768759228805.png';
const outputPath = path.join(__dirname, 'assets/icon.png');

sharp(inputPath)
    .resize(1024, 1024)
    .png()
    .toFile(outputPath)
    .then(info => {
        console.log('Generated icon converted to PNG:', info);
    })
    .catch(err => {
        console.error('Error converting icon:', err);
        process.exit(1);
    });
