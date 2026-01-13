const pdfPrinter = require('pdf-to-printer');
const imagesToPdf = require('images-to-pdf'); // Requires: npm install images-to-pdf
const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const { exec } = require('child_process');

// Folder temp
const TEMP_DIR = path.join(os.tmpdir(), 'zalo-automation-print');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function downloadToTemp(url, ext) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);

        const buffer = await response.buffer();
        const filename = `print_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
        const filePath = path.join(TEMP_DIR, filename);

        fs.writeFileSync(filePath, buffer);
        return filePath;
    } catch (error) {
        throw new Error(`Error saving temp file: ${error.message}`);
    }
}

async function printFile(url, fileType, fileName, senderId) {
    let tempPath = null;
    let pdfPath = null;

    // ========================================
    // HYBRID MODE: Kiểm tra có print agent không
    // ========================================
    try {
        const { hasPrintAgent, sendToPrintAgent } = require('./system/websocket.js');

        if (hasPrintAgent && hasPrintAgent()) {
            console.log('🖨️ Sending print request to remote Print Agent...');
            const sent = sendToPrintAgent({
                fileUrl: url,
                fileName: fileName || `file.${fileType}`,
                fileType: fileType,
                senderId: senderId
            });

            if (sent) {
                return { success: true, message: 'Đã gửi lệnh in tới Print Agent.', remote: true };
            }
            // Nếu không gửi được, fallback in local
            console.log('⚠️ Print Agent failed, falling back to local printing...');
        }
    } catch (e) {
        // websocket module chưa sẵn sàng, in local
        console.log('⚠️ Print Agent not available, using local printing');
    }

    // ========================================
    // LOCAL MODE: In trực tiếp trên máy này
    // ========================================
    try {
        // CASE 1: PDF
        if (fileType === 'pdf') {
            tempPath = await downloadToTemp(url, 'pdf');
            console.log(`🖨️ Printing PDF: ${tempPath}`);
            await pdfPrinter.print(tempPath);
        }
        // CASE 2: IMAGE (jpg, png, jpeg, image)
        else if (['jpg', 'jpeg', 'png', 'image'].includes(fileType)) {
            // Download original image
            tempPath = await downloadToTemp(url, 'png'); // Save as png/jpg default
            pdfPath = tempPath + '.pdf'; // Output pdf path

            console.log(`🖼️ Converting image to PDF: ${tempPath} -> ${pdfPath}`);
            await imagesToPdf([tempPath], pdfPath);

            console.log(`🖨️ Printing converted PDF...`);
            await pdfPrinter.print(pdfPath);
        }
        // CASE 3: OFFICE (docx, xlsx) - Requires MS Office installed
        else if (['doc', 'docx', 'xls', 'xlsx'].includes(fileType)) {
            tempPath = await downloadToTemp(url, fileType);
            console.log(`🖨️ Printing Office file via PowerShell: ${tempPath}`);
            await printOffice(tempPath, fileType);
        }
        else {
            return { success: false, message: 'Chỉ hỗ trợ in PDF, Ảnh, Word và Excel.' };
        }

        // Cleanup
        setTimeout(() => {
            if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        }, 15000);

        return { success: true, message: 'Đã gửi lệnh in thành công.', remote: false };
    } catch (error) {
        console.error('Print error:', error);
        return { success: false, message: `Lỗi in ấn: ${error.message}` };
    }
}

async function printOffice(filePath, ext) {
    return new Promise((resolve, reject) => {
        // Escape path for PowerShell
        const safePath = filePath.replace(/'/g, "''");
        let psScript = '';

        if (['doc', 'docx'].includes(ext)) {
            psScript = `
        try {
          $w = New-Object -ComObject Word.Application;
          $w.Visible = $false;
          $d = $w.Documents.Open('${safePath}');
          $d.PrintOut();
          $d.Close($false);
          $w.Quit();
        } catch {
          exit 1
        }
      `;
        } else if (['xls', 'xlsx'].includes(ext)) {
            psScript = `
        try {
          $e = New-Object -ComObject Excel.Application;
          $e.Visible = $false;
          $w = $e.Workbooks.Open('${safePath}');
          $w.PrintOut();
          $w.Close($false);
          $e.Quit();
        } catch {
          exit 1
        }
      `;
        }

        if (!psScript) return reject(new Error("Unsupported office type"));

        const cmd = `powershell -Command "${psScript.replace(/\n/g, ' ')}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('Office Print Error:', stderr);
                // Kiểm tra stderr xem có phải lỗi COM ko
                reject(new Error("Không thể in file Office (Lỗi hoặc máy chưa cài Office)."));
            } else {
                resolve(true);
            }
        });
    });
}

// Lấy danh sách máy in (để debug hoặc chọn máy sau này)
async function getPrinters() {
    try {
        return await pdfPrinter.getPrinters();
    } catch (e) {
        return [];
    }
}

module.exports = {
    printFile,
    getPrinters
};
