const sharp = require('sharp');
const path = require('path');

const svgPath = path.join(__dirname, 'assets/icon.svg');
const pngPath = path.join(__dirname, 'assets/icon.png');

sharp(svgPath)
    .resize(1024, 1024)
    .png()
    .toFile(pngPath)
    .then(info => {
        console.log('Icon converted successfully:', info);
    })
    .catch(err => {
        console.error('Error converting icon:', err);
        process.exit(1);
    });
