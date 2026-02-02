/**
 * Icon Generator Script for PDF Smart Tools
 *
 * This script generates PNG icons from the SVG source for Android.
 *
 * Prerequisites:
 *   npm install sharp --save-dev
 *
 * Usage:
 *   node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  const { execSync } = require('child_process');
  execSync('npm install sharp --save-dev', { stdio: 'inherit' });
  sharp = require('sharp');
}

// Icon sizes for Android
const ANDROID_ICONS = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 },
];

// SVG content for the icon
const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">
  <!-- Background -->
  <rect width="108" height="108" fill="#0D47A1"/>
  <polygon points="0,0 108,0 0,108" fill="#1976D2" opacity="0.6"/>
  <polygon points="0,0 60,0 0,60" fill="#42A5F5" opacity="0.3"/>

  <!-- Document shadow -->
  <path d="M32,22 L58,22 L72,36 L72,86 L32,86 Z" fill="#000" opacity="0.2"/>

  <!-- Main document -->
  <path d="M30,20 L56,20 L70,34 L70,84 L30,84 Z" fill="#FFFFFF"/>

  <!-- Folded corner -->
  <path d="M56,20 L56,34 L70,34 Z" fill="#E8EAF6"/>

  <!-- PDF Badge -->
  <rect x="26" y="44" width="48" height="18" fill="#E53935"/>

  <!-- PDF Text -->
  <text x="50" y="57" font-family="Arial" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">PDF</text>

  <!-- Content lines -->
  <line x1="36" y1="70" x2="64" y2="70" stroke="#C5CAE9" stroke-width="3" stroke-linecap="round"/>
  <line x1="36" y1="77" x2="56" y2="77" stroke="#E8EAF6" stroke-width="3" stroke-linecap="round"/>

  <!-- Gear -->
  <circle cx="72" cy="76" r="16" fill="#2196F3"/>
  <circle cx="72" cy="76" r="9" fill="none" stroke="#FFFFFF" stroke-width="4"/>
  <circle cx="72" cy="76" r="3.5" fill="#FFFFFF"/>
</svg>`;

const ROUND_SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">
  <defs>
    <clipPath id="roundClip">
      <circle cx="54" cy="54" r="54"/>
    </clipPath>
  </defs>
  <g clip-path="url(#roundClip)">
    <!-- Background -->
    <rect width="108" height="108" fill="#0D47A1"/>
    <polygon points="0,0 108,0 0,108" fill="#1976D2" opacity="0.6"/>

    <!-- Document shadow -->
    <path d="M32,22 L58,22 L72,36 L72,86 L32,86 Z" fill="#000" opacity="0.2"/>

    <!-- Main document -->
    <path d="M30,20 L56,20 L70,34 L70,84 L30,84 Z" fill="#FFFFFF"/>

    <!-- Folded corner -->
    <path d="M56,20 L56,34 L70,34 Z" fill="#E8EAF6"/>

    <!-- PDF Badge -->
    <rect x="26" y="44" width="48" height="18" fill="#E53935"/>

    <!-- PDF Text -->
    <text x="50" y="57" font-family="Arial" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle">PDF</text>

    <!-- Content lines -->
    <line x1="36" y1="70" x2="64" y2="70" stroke="#C5CAE9" stroke-width="3" stroke-linecap="round"/>
    <line x1="36" y1="77" x2="56" y2="77" stroke="#E8EAF6" stroke-width="3" stroke-linecap="round"/>

    <!-- Gear -->
    <circle cx="72" cy="76" r="16" fill="#2196F3"/>
    <circle cx="72" cy="76" r="9" fill="none" stroke="#FFFFFF" stroke-width="4"/>
    <circle cx="72" cy="76" r="3.5" fill="#FFFFFF"/>
  </g>
</svg>`;

async function generateIcons() {
  const androidResPath = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

  

  for (const icon of ANDROID_ICONS) {
    const folderPath = path.join(androidResPath, icon.name);

    // Ensure folder exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Generate square icon
    const squarePath = path.join(folderPath, 'ic_launcher.png');
    await sharp(Buffer.from(SVG_CONTENT))
      .resize(icon.size, icon.size)
      .png()
      .toFile(squarePath);
    

    // Generate round icon
    const roundPath = path.join(folderPath, 'ic_launcher_round.png');
    await sharp(Buffer.from(ROUND_SVG_CONTENT))
      .resize(icon.size, icon.size)
      .png()
      .toFile(roundPath);
    
  }

  
}

generateIcons().catch(console.error);
