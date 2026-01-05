// sync-files.js - Sync các file đã upload vào database
// Chạy: node sync-files.js <userUID>
// Ví dụ: node sync-files.js 716585949090695726

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'triggers.db');
const FILES_DIR = path.join(__dirname, 'data', 'files');
const IMAGES_DIR = path.join(__dirname, 'data', 'images');

// Lấy userUID từ command line
const userUID = process.argv[2];

if (!userUID) {
  console.error('❌ Vui lòng cung cấp userUID!');
  console.log('Usage: node sync-files.js <userUID>');
  console.log('Example: node sync-files.js 716585949090695726');
  process.exit(1);
}

console.log('🔄 Syncing files to database...');
console.log(`   Database: ${DB_PATH}`);
console.log(`   Files dir: ${FILES_DIR}`);
console.log(`   Images dir: ${IMAGES_DIR}`);
console.log(`   User UID: ${userUID}`);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database not found!');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Helper functions
function getFileTypeFromMime(mimeType) {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'powerpoint';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compressed')) return 'archive';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';
  return 'other';
}

function getMimeType(ext) {
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

function getCategoryFromType(fileType) {
  const categories = {
    'pdf': 'document',
    'word': 'document',
    'excel': 'spreadsheet',
    'powerpoint': 'presentation',
    'image': 'image',
    'video': 'media',
    'audio': 'media',
    'archive': 'archive',
    'text': 'document'
  };
  return categories[fileType] || 'document';
}

// Check if file exists in database
function fileExistsInDB(fileName) {
  const result = db.prepare('SELECT fileID FROM files WHERE fileName = ? AND userUID = ?').get(fileName, userUID);
  return !!result;
}

function imageExistsInDB(fileName) {
  const result = db.prepare('SELECT imageID FROM images WHERE fileName = ? AND userUID = ?').get(fileName, userUID);
  return !!result;
}

// Sync FILES
console.log('\n📁 Syncing FILES...\n');

let filesAdded = 0;
let filesSkipped = 0;

if (fs.existsSync(FILES_DIR)) {
  const files = fs.readdirSync(FILES_DIR);
  
  for (const fileName of files) {
    const filePath = path.join(FILES_DIR, fileName);
    const stat = fs.statSync(filePath);
    
    if (!stat.isFile()) continue;
    
    if (fileExistsInDB(fileName)) {
      console.log(`⏭️  ${fileName} - already in database`);
      filesSkipped++;
      continue;
    }
    
    const ext = path.extname(fileName);
    const mimeType = getMimeType(ext);
    const fileType = getFileTypeFromMime(mimeType);
    const category = getCategoryFromType(fileType);
    
    // Tạo tên hiển thị từ fileName (bỏ timestamp prefix)
    let displayName = fileName;
    const match = fileName.match(/^\d+_(.+)$/);
    if (match) {
      displayName = match[1];
    }
    
    try {
      const now = Date.now();
      db.prepare(`
        INSERT INTO files (userUID, name, variableName, description, fileName, filePath, fileSize, mimeType, fileType, category, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userUID,
        displayName,
        null,
        null,
        fileName,
        filePath,
        stat.size,
        mimeType,
        fileType,
        category,
        now,
        now
      );
      
      console.log(`✅ ${fileName} - added to database`);
      filesAdded++;
    } catch (error) {
      console.error(`❌ ${fileName} - error: ${error.message}`);
    }
  }
} else {
  console.log('⚠️  Files directory not found');
}

// Sync IMAGES
console.log('\n🖼️  Syncing IMAGES...\n');

let imagesAdded = 0;
let imagesSkipped = 0;

if (fs.existsSync(IMAGES_DIR)) {
  const images = fs.readdirSync(IMAGES_DIR);
  
  for (const fileName of images) {
    const filePath = path.join(IMAGES_DIR, fileName);
    const stat = fs.statSync(filePath);
    
    if (!stat.isFile()) continue;
    
    if (imageExistsInDB(fileName)) {
      console.log(`⏭️  ${fileName} - already in database`);
      imagesSkipped++;
      continue;
    }
    
    const ext = path.extname(fileName);
    const mimeType = getMimeType(ext);
    
    // Tạo tên hiển thị từ fileName (bỏ timestamp prefix)
    let displayName = fileName;
    const match = fileName.match(/^\d+_(.+)$/);
    if (match) {
      displayName = match[1];
    }
    
    try {
      const now = Date.now();
      db.prepare(`
        INSERT INTO images (userUID, name, variableName, description, fileName, filePath, fileSize, mimeType, width, height, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userUID,
        displayName,
        null,
        null,
        fileName,
        filePath,
        stat.size,
        mimeType,
        null,
        null,
        now,
        now
      );
      
      console.log(`✅ ${fileName} - added to database`);
      imagesAdded++;
    } catch (error) {
      console.error(`❌ ${fileName} - error: ${error.message}`);
    }
  }
} else {
  console.log('⚠️  Images directory not found');
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 SYNC COMPLETED!');
console.log('='.repeat(50));
console.log(`\n📁 Files:`);
console.log(`   - Added: ${filesAdded}`);
console.log(`   - Skipped: ${filesSkipped}`);
console.log(`\n🖼️  Images:`);
console.log(`   - Added: ${imagesAdded}`);
console.log(`   - Skipped: ${imagesSkipped}`);

// Show total in database
const totalFiles = db.prepare('SELECT COUNT(*) as count FROM files WHERE userUID = ?').get(userUID);
const totalImages = db.prepare('SELECT COUNT(*) as count FROM images WHERE userUID = ?').get(userUID);
console.log(`\n📈 Total in database:`);
console.log(`   - Files: ${totalFiles.count}`);
console.log(`   - Images: ${totalImages.count}`);

db.close();
console.log('\n✅ Done!\n');