const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');

// MongoDB Schema for storing SQLite database files as Binary Buffers
const dbFileSchema = new mongoose.Schema({
    filename: { type: String, required: true, unique: true },
    data: { type: Buffer, required: true },
    lastModified: { type: Date, required: true },
    lastSync: { type: Date, default: Date.now }
});

const DbFile = mongoose.model('DbFile', dbFileSchema);

let isSyncing = false;
let syncInterval = null;

/**
 * Initialize MongoDB connection and restore databases if they exist.
 */
async function initMongoSync() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.warn('⚠️ MONGO_URI không được cung cấp. Bỏ qua đồng bộ MongoDB.');
        return false;
    }

    try {
        console.log('🔄 Đang kết nối tới MongoDB để đồng bộ Database...');
        await mongoose.connect(mongoUri);
        console.log('✅ Kết nối MongoDB thành công.');

        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        // Restore files from MongoDB on startup
        await restoreAllFiles();

        // Start background sync every 30 seconds
        syncInterval = setInterval(() => {
            syncDatabasesToMongo();
        }, 30000);

        // Handle graceful shutdown to sync one last time
        process.on('SIGINT', async () => {
            console.log('\n🛑 Đang tắt server, tiến hành đồng bộ dữ liệu cuối cùng...');
            await syncDatabasesToMongo(true);
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await syncDatabasesToMongo(true);
            process.exit(0);
        });

        return true;
    } catch (error) {
        console.error('❌ Lỗi kết nối MongoDB:', error.message);
        return false;
    }
}

/**
 * Restore a specific database file from MongoDB to local disk.
 */
async function restoreFile(filename) {
    try {
        const remoteFile = await DbFile.findOne({ filename });
        const localPath = path.join(DATA_DIR, filename);

        if (!remoteFile) {
            console.log(`ℹ️ Không tìm thấy ${filename} trên MongoDB. Sẽ tạo mới.`);
            return;
        }

        let shouldRestore = true;
        if (fs.existsSync(localPath)) {
            const localStat = fs.statSync(localPath);
            // Only restore if the remote file is newer than the local one
            if (localStat.mtime.getTime() >= remoteFile.lastModified.getTime()) {
                shouldRestore = false;
            }
        }

        if (shouldRestore) {
            fs.writeFileSync(localPath, remoteFile.data);
            // Update local file modification time to match remote
            fs.utimesSync(localPath, remoteFile.lastModified, remoteFile.lastModified);
            console.log(`📥 Đã khôi phục thành công ${filename} từ MongoDB.`);
        } else {
            console.log(`ℹ️ Bỏ qua khôi phục ${filename} (Local mới hơn hoặc bằng Remote).`);
        }
    } catch (error) {
        console.error(`❌ Lỗi khôi phục ${filename}:`, error.message);
    }
}

/**
 * Backup a specific file to MongoDB if it was modified recently.
 */
async function backupFile(filename, force = false) {
    const localPath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(localPath)) return;

    try {
        const localStat = fs.statSync(localPath);
        const remoteFile = await DbFile.findOne({ filename });

        let shouldBackup = force;
        if (!shouldBackup) {
            if (!remoteFile) {
                shouldBackup = true;
            } else if (localStat.mtime.getTime() > remoteFile.lastModified.getTime()) {
                shouldBackup = true;
            }
        }

        if (shouldBackup) {
            const fileData = fs.readFileSync(localPath);
            await DbFile.findOneAndUpdate(
                { filename },
                {
                    filename,
                    data: fileData,
                    lastModified: localStat.mtime,
                    lastSync: new Date()
                },
                { upsert: true, returnDocument: 'after' }
            );
            console.log(`☁️ Đã đồng bộ ${filename} lên MongoDB.`);
        }
    } catch (error) {
        console.error(`❌ Lỗi đồng bộ ${filename} lên MongoDB:`, error.message);
    }
}

/**
 * Synchronize all files in the data directory to MongoDB.
 */
async function syncDatabasesToMongo(force = false) {
    if (isSyncing) return;
    isSyncing = true;
    try {
        if (fs.existsSync(DATA_DIR)) {
            const files = fs.readdirSync(DATA_DIR);
            for (const file of files) {
                // Ignore backup directories or non-files
                const stat = fs.statSync(path.join(DATA_DIR, file));
                if (stat.isFile()) {
                    await backupFile(file, force);
                }
            }
        }
    } catch (error) {
        console.error('❌ Lỗi quá trình đồng bộ định kỳ:', error.message);
    } finally {
        isSyncing = false;
    }
}

/**
 * Restore all files from MongoDB on startup.
 */
async function restoreAllFiles() {
    try {
        const remoteFiles = await DbFile.find({}, 'filename lastModified');
        for (const rf of remoteFiles) {
            await restoreFile(rf.filename);
        }
    } catch (error) {
        console.error('❌ Lỗi khôi phục toàn bộ dữ liệu:', error.message);
    }
}

module.exports = {
    initMongoSync,
    syncDatabasesToMongo
};
