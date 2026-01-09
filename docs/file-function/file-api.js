// file-api.js - API endpoints cho Files & Templates
// ============================================
// HƯỚNG DẪN: Thêm dòng sau vào server.js sau khi khởi tạo app và triggerDB:
//   require('./file-api')(app, triggerDB);
// ============================================

const path = require('path');
const fs = require('fs');

module.exports = function(app, triggerDB) {
  
  console.log('📁 Registering File & Template API endpoints...');
  
  // =====================================================
  // FILE ENDPOINTS
  // =====================================================
  
  // Serve file by ID
  app.get('/api/files/:id', (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      if (!fileId) return res.status(400).json({ error: 'Invalid file ID' });
      
      const file = triggerDB.getFileById(fileId);
      if (!file) return res.status(404).json({ error: 'File not found' });
      if (!fs.existsSync(file.filePath)) return res.status(404).json({ error: 'File not found on disk' });
      
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      if (file.fileSize) res.setHeader('Content-Length', file.fileSize);
      
      fs.createReadStream(file.filePath).pipe(res);
      
    } catch (error) {
      console.error('❌ Serve file error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Download file
  app.get('/api/files/:id/download', (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const file = triggerDB.getFileById(fileId);
      
      if (!file || !fs.existsSync(file.filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName || 'file')}"`);
      res.setHeader('Content-Length', file.fileSize || fs.statSync(file.filePath).size);
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      fs.createReadStream(file.filePath).pipe(res);
      
    } catch (error) {
      console.error('❌ Download file error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get file by variable name
  app.get('/api/files/var/:variableName', (req, res) => {
    try {
      const variableName = req.params.variableName;
      const userUID = req.query.userUID;
      
      const db = triggerDB.getDB();
      let file;
      
      if (userUID) {
        file = db.prepare('SELECT * FROM files WHERE variableName = ? AND userUID = ?').get(variableName, userUID);
      } else {
        file = db.prepare('SELECT * FROM files WHERE variableName = ?').get(variableName);
      }
      
      if (!file || !fs.existsSync(file.filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      fs.createReadStream(file.filePath).pipe(res);
      
    } catch (error) {
      console.error('❌ Serve file by variable error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // =====================================================
  // TEMPLATE ENDPOINTS
  // =====================================================

  // Serve template file (original)
  app.get('/api/templates/:id', (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = triggerDB.getFileTemplateById(templateId);
      
      if (!template) {
        console.log('❌ Template not found:', templateId);
        return res.status(404).json({ error: 'Template not found' });
      }
      
      if (!fs.existsSync(template.filePath)) {
        console.log('❌ Template file not on disk:', template.filePath);
        return res.status(404).json({ error: 'Template file not found on disk' });
      }
      
      res.setHeader('Content-Type', template.mimeType || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      fs.createReadStream(template.filePath).pipe(res);
      
    } catch (error) {
      console.error('❌ Serve template error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Download template file (original - không thay thế biến)
  app.get('/api/templates/:id/download', (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      console.log('📥 Template download request:', templateId);
      
      const template = triggerDB.getFileTemplateById(templateId);
      
      if (!template) {
        console.log('❌ Template not found in DB:', templateId);
        return res.status(404).json({ error: 'Template not found' });
      }
      
      console.log('📋 Template found:', template.name, template.filePath);
      
      if (!fs.existsSync(template.filePath)) {
        console.log('❌ Template file not on disk:', template.filePath);
        return res.status(404).json({ error: 'Template file not found on disk' });
      }
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(template.fileName)}"`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      fs.createReadStream(template.filePath).pipe(res);
      
    } catch (error) {
      console.error('❌ Download template error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // =====================================================
  // GENERATE TEMPLATE - Thay thế biến và tải xuống
  // =====================================================
  
  // GET /api/templates/:id/generate?var1=value1&var2=value2
  app.get('/api/templates/:id/generate', async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      console.log('📄 Generate template request:', templateId);
      
      const template = triggerDB.getFileTemplateById(templateId);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      if (!fs.existsSync(template.filePath)) {
        return res.status(404).json({ error: 'Template file not found on disk' });
      }
      
      // Lấy variables từ query params
      let variables = {};
      Object.keys(req.query).forEach(key => {
        if (key !== 'userUID' && key !== 'senderId') {
          variables[key] = req.query[key];
        }
      });
      
      console.log('📝 Variables:', variables);
      
      const ext = path.extname(template.fileName).toLowerCase();
      let outputBuffer;
      let outputFileName = template.name + '_filled' + ext;
      
      // Xử lý theo loại file
      if (ext === '.docx') {
        outputBuffer = await generateDocx(template.filePath, variables);
      } 
      else if (ext === '.xlsx' || ext === '.xls') {
        outputBuffer = await generateExcel(template.filePath, variables);
      }
      else if (ext === '.txt' || ext === '.html' || ext === '.csv') {
        outputBuffer = await generateTextFile(template.filePath, variables);
      }
      else {
        // Không hỗ trợ - trả về file gốc
        console.log('⚠️ Unsupported template type, returning original:', ext);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(template.fileName)}"`);
        return fs.createReadStream(template.filePath).pipe(res);
      }
      
      // Trả về file đã xử lý
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outputFileName)}"`);
      res.setHeader('Content-Length', outputBuffer.length);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(outputBuffer);
      
      console.log('✅ Template generated:', outputFileName);
      
    } catch (error) {
      console.error('❌ Generate template error:', error.message);
      console.error(error.stack);
      res.status(500).json({ error: 'Failed to generate template: ' + error.message });
    }
  });

  // =====================================================
  // CORS OPTIONS
  // =====================================================
  
  app.options('/api/files/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  app.options('/api/templates/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  console.log('✅ File & Template API endpoints registered:');
  console.log('   GET /api/files/:id');
  console.log('   GET /api/files/:id/download');
  console.log('   GET /api/files/var/:variableName');
  console.log('   GET /api/templates/:id');
  console.log('   GET /api/templates/:id/download');
  console.log('   GET /api/templates/:id/generate');
};

// =====================================================
// HELPER FUNCTIONS - Xử lý file templates
// =====================================================

/**
 * Generate Word document với biến được thay thế
 */
async function generateDocx(filePath, variables) {
  try {
    // Thử dùng docxtemplater
    const PizZip = require('pizzip');
    const Docxtemplater = require('docxtemplater');
    
    const content = fs.readFileSync(filePath, 'binary');
    const zip = new PizZip(content);
    
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' }
    });
    
    doc.render(variables);
    
    return doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });
    
  } catch (error) {
    console.log('⚠️ Docxtemplater not available, using simple replacement');
    return generateDocxSimple(filePath, variables);
  }
}

/**
 * Fallback: Simple docx generation
 */
async function generateDocxSimple(filePath, variables) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    
    let docXml = zip.readAsText('word/document.xml');
    
    // Thay thế các biến {name} -> value
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      docXml = docXml.replace(regex, escapeXml(variables[key] || ''));
    });
    
    zip.updateFile('word/document.xml', Buffer.from(docXml, 'utf-8'));
    
    return zip.toBuffer();
    
  } catch (error) {
    console.error('❌ Simple docx generation error:', error.message);
    return fs.readFileSync(filePath);
  }
}

/**
 * Generate Excel file với biến được thay thế
 */
async function generateExcel(filePath, variables) {
  try {
    const ExcelJS = require('exceljs');
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    workbook.eachSheet((worksheet) => {
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value && typeof cell.value === 'string') {
            let newValue = cell.value;
            Object.keys(variables).forEach(key => {
              const regex = new RegExp(`\\{${key}\\}`, 'g');
              newValue = newValue.replace(regex, variables[key] || '');
            });
            if (newValue !== cell.value) cell.value = newValue;
          }
        });
      });
    });
    
    return Buffer.from(await workbook.xlsx.writeBuffer());
    
  } catch (error) {
    console.error('❌ Excel generation error:', error.message);
    return fs.readFileSync(filePath);
  }
}

/**
 * Generate text file với biến được thay thế
 */
async function generateTextFile(filePath, variables) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      content = content.replace(regex, variables[key] || '');
    });
    
    return Buffer.from(content, 'utf-8');
    
  } catch (error) {
    console.error('❌ Text file generation error:', error.message);
    return fs.readFileSync(filePath);
  }
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}