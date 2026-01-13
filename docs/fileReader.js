const fetch = require('node-fetch');
const xlsx = require('xlsx');

// Hàm download file từ URL
async function downloadFile(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 10000 // 10s timeout
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.buffer();
    } catch (error) {
        console.error('❌ Error downloading file:', error.message);
        throw error;
    }
}

// Hàm đọc và tóm tắt nội dung file
async function readAndSummarize(url, fileExt) {
    try {
        const buffer = await downloadFile(url);

        if (['xlsx', 'xls', 'csv'].includes(fileExt)) {
            return parseExcel(buffer);
        }

        return 'Chưa hỗ trợ đọc loại file này.';
    } catch (error) {
        return `Lỗi khi đọc file: ${error.message}`;
    }
}

// Parse Excel buffer
function parseExcel(buffer) {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Convert to JSON (limit 5 rows)
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (data.length === 0) return '[File rỗng]';

        const previewRows = data.slice(0, 5); // Lấy 5 dòng đầu
        let summary = `📋 Nội dung ${sheetName} (${data.length} dòng):\n`;

        previewRows.forEach((row, index) => {
            const rowText = row.filter(cell => cell !== '').join(' | ');
            if (rowText.trim()) {
                summary += `Row ${index + 1}: ${rowText}\n`;
            }
        });

        if (data.length > 5) summary += `... và ${data.length - 5} dòng khác.`;

        return summary;
    } catch (error) {
        console.error('❌ Error parsing Excel:', error);
        return 'Lỗi phân tích file Excel.';
    }
}

module.exports = {
    readAndSummarize
};
