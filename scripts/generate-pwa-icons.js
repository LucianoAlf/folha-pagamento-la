import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SOURCE = './public/icone-pwa-ana.png';
const ICONS_DIR = './public/icons';
const SPLASH_DIR = './public/splash';

// PWA icon sizes
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

// iOS splash screens
const SPLASH_SIZES = [
  { width: 640, height: 1136, name: 'splash-640x1136.png' },
  { width: 750, height: 1334, name: 'splash-750x1334.png' },
  { width: 1242, height: 2208, name: 'splash-1242x2208.png' },
  { width: 1125, height: 2436, name: 'splash-1125x2436.png' },
  { width: 1284, height: 2778, name: 'splash-1284x2778.png' },
];

const BG = { r: 15, g: 18, b: 25, alpha: 1 }; // #0f1219

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function generateIcons() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Source image not found: ${SOURCE}`);
  }

  console.log('🎨 Gerando ícones PWA a partir do avatar da Ana...\n');

  await ensureDir(ICONS_DIR);
  await ensureDir(SPLASH_DIR);

  for (const size of ICON_SIZES) {
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover', background: BG })
      .png()
      .toFile(path.join(ICONS_DIR, `icon-${size}x${size}.png`));
    console.log(`✅ icon-${size}x${size}.png`);
  }

  await sharp(SOURCE).resize(32, 32).png().toFile(path.join(ICONS_DIR, 'favicon-32x32.png'));
  console.log('✅ favicon-32x32.png');

  await sharp(SOURCE).resize(16, 16).png().toFile(path.join(ICONS_DIR, 'favicon-16x16.png'));
  console.log('✅ favicon-16x16.png');

  await sharp(SOURCE).resize(180, 180).png().toFile(path.join(ICONS_DIR, 'apple-touch-icon-180x180.png'));
  console.log('✅ apple-touch-icon-180x180.png');

  await sharp(SOURCE).resize(72, 72).png().toFile(path.join(ICONS_DIR, 'badge-72x72.png'));
  console.log('✅ badge-72x72.png');

  await sharp(SOURCE).resize(48, 48).png().toFile(path.join(ICONS_DIR, 'favicon.png'));
  console.log('✅ favicon.png');

  console.log('\n🖼️ Gerando splash screens...\n');

  for (const splash of SPLASH_SIZES) {
    const iconSize = Math.min(splash.width, splash.height) * 0.3;

    const background = await sharp({
      create: {
        width: splash.width,
        height: splash.height,
        channels: 4,
        background: BG,
      },
    })
      .png()
      .toBuffer();

    const icon = await sharp(SOURCE)
      .resize(Math.round(iconSize), Math.round(iconSize))
      .png()
      .toBuffer();

    await sharp(background)
      .composite([{ input: icon, gravity: 'center' }])
      .png()
      .toFile(path.join(SPLASH_DIR, splash.name));

    console.log(`✅ ${splash.name}`);
  }

  console.log('\n🎉 Ícones gerados com sucesso!');
  console.log(`📁 Ícones em: ${ICONS_DIR}`);
  console.log(`📁 Splash screens em: ${SPLASH_DIR}`);
}

generateIcons().catch((err) => {
  console.error('❌ Erro:', err);
  process.exit(1);
});

