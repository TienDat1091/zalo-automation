#!/usr/bin/env node
/**
 * PRINT AGENT - Chạy trên máy Windows có máy in
 * Kết nối với Render server qua WebSocket để nhận lệnh in
 * 
 * Cách sử dụng:
 *   node print-agent.js
 * 
 * Biến môi trường:
 *   RENDER_URL - URL của server Render (mặc định: wss://zalo-automation.onrender.com)
 */

const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// ========================================
// CONFIG
// ========================================
const RENDER_URL = process.env.RENDER_URL || 'wss://zalo-automation.onrender.com';
const PRINT_TEMP_DIR = path.join(os.tmpdir(), 'zalo-print-agent');
const RECONNECT_INTERVAL = 5000; // 5 seconds

// Đảm bảo thư mục temp tồn tại
if (!fs.existsSync(PRINT_TEMP_DIR)) {
    fs.mkdirSync(PRINT_TEMP_DIR, { recursive: true });
}

// ========================================
// LOGGING
// ========================================
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const icons = { info: 'ℹ️', success: '✅', error: '❌', print: '🖨️', ws: '📡' };
    console.log(`[${timestamp}] ${icons[type] || 'ℹ️'} ${message}`);
}

// ========================================
// DOWNLOAD FILE
// ========================================
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);

        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(destPath);
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => { }); // Delete the file on error
            reject(err);
        });
    });
}

// ========================================
// PRINT FILE (Windows)
// ========================================
function printFile(filePath) {
    return new Promise((resolve, reject) => {
        const platform = os.platform();

        if (platform !== 'win32') {
            reject(new Error(`OS không được hỗ trợ: ${platform}. Print Agent chỉ chạy trên Windows.`));
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        let command;

        if (ext === '.pdf') {
            // Dùng SumatraPDF nếu có, fallback sang Adobe Reader hoặc default
            command = `start /min "" "${filePath}" /p`;

            // Thử dùng PowerShell Print
            command = `powershell -Command "Start-Process -FilePath '${filePath}' -Verb Print"`;
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext)) {
            // In ảnh bằng Windows Photo Viewer
            command = `rundll32 shimgvw.dll,ImageView_PrintTo /pt "${filePath}"`;
        } else if (['.doc', '.docx', '.xls', '.xlsx'].includes(ext)) {
            // In Word/Excel qua default app
            command = `powershell -Command "Start-Process -FilePath '${filePath}' -Verb Print"`;
        } else {
            // Fallback: mở và in
            command = `powershell -Command "Start-Process -FilePath '${filePath}' -Verb Print"`;
        }

        log(`Executing: ${command}`, 'print');

        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(true);
            }
        });
    });
}

// ========================================
// WEBSOCKET CONNECTION
// ========================================
let ws = null;
let reconnectTimeout = null;

function connect() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    log(`Connecting to ${RENDER_URL}...`, 'ws');

    try {
        ws = new WebSocket(RENDER_URL);

        ws.on('open', () => {
            log('Connected to Render server!', 'success');

            // Đăng ký là Print Agent
            ws.send(JSON.stringify({
                type: 'register_print_agent',
                platform: os.platform(),
                hostname: os.hostname()
            }));
        });

        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());

                if (message.type === 'print_request') {
                    await handlePrintRequest(message);
                } else if (message.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong' }));
                }
            } catch (err) {
                log(`Parse error: ${err.message}`, 'error');
            }
        });

        ws.on('close', (code, reason) => {
            log(`Disconnected (code: ${code}). Reconnecting in ${RECONNECT_INTERVAL / 1000}s...`, 'ws');
            scheduleReconnect();
        });

        ws.on('error', (err) => {
            log(`WebSocket error: ${err.message}`, 'error');
        });

    } catch (err) {
        log(`Connection failed: ${err.message}`, 'error');
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (!reconnectTimeout) {
        reconnectTimeout = setTimeout(connect, RECONNECT_INTERVAL);
    }
}

// ========================================
// HANDLE PRINT REQUEST
// ========================================
async function handlePrintRequest(message) {
    const { requestId, fileUrl, fileName, senderId } = message;

    log(`Received print request: ${fileName} from ${senderId}`, 'print');

    // Tạo file path
    const ext = path.extname(fileName) || '.pdf';
    const localPath = path.join(PRINT_TEMP_DIR, `print_${Date.now()}${ext}`);

    try {
        // 1. Download file
        log(`Downloading: ${fileUrl}`, 'info');
        await downloadFile(fileUrl, localPath);
        log(`Downloaded to: ${localPath}`, 'success');

        // 2. Print file
        log(`Printing: ${fileName}`, 'print');
        await printFile(localPath);
        log(`Print job sent: ${fileName}`, 'success');

        // 3. Báo thành công về server
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'print_result',
                requestId,
                success: true,
                fileName,
                senderId
            }));
        }

        // 4. Xóa file temp sau 30s
        setTimeout(() => {
            fs.unlink(localPath, () => { });
        }, 30000);

    } catch (err) {
        log(`Print failed: ${err.message}`, 'error');

        // Báo lỗi về server
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'print_result',
                requestId,
                success: false,
                error: err.message,
                fileName,
                senderId
            }));
        }
    }
}

// ========================================
// MAIN
// ========================================
console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║           🖨️  ZALO PRINT AGENT - STARTING                 ║');
console.log('╠═══════════════════════════════════════════════════════════╣');
console.log(`║  Server: ${RENDER_URL.substring(0, 45).padEnd(45)} ║`);
console.log(`║  Platform: ${os.platform().padEnd(43)} ║`);
console.log(`║  Hostname: ${os.hostname().substring(0, 43).padEnd(43)} ║`);
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

connect();

// Graceful shutdown
process.on('SIGINT', () => {
    log('Shutting down...', 'info');
    if (ws) ws.close();
    process.exit(0);
});
