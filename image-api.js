// image-api.js - API endpoint để serve images CHẤT LƯỢNG GỐC
// Thêm vào server.js: require('./image-api')(app, triggerDB);

const path = require('path');
const fs = require('fs');

module.exports = function(app, triggerDB) {
  
  // ✅ Serve image by ID - CHẤT LƯỢNG GỐC
  app.get('/api/images/:id', (req, res) => {
    try {
      const imageId = parseInt(req.params.id);
      
      if (!imageId) {
        return res.status(400).json({ error: 'Invalid image ID' });
      }
      
      const image = triggerDB.getImageById(imageId);
      
      if (!image) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Check if file exists
      if (!fs.existsSync(image.filePath)) {
        return res.status(404).json({ error: 'Image file not found' });
      }
      
      // ✅ Set headers cho ảnh chất lượng gốc
      res.setHeader('Content-Type', image.mimeType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 năm
      res.setHeader('Accept-Ranges', 'bytes');
      
      // ✅ CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      
      // ✅ Thêm headers về kích thước nếu có
      if (image.width && image.height) {
        res.setHeader('X-Image-Width', image.width);
        res.setHeader('X-Image-Height', image.height);
      }
      if (image.fileSize) {
        res.setHeader('Content-Length', image.fileSize);
      }
      
      // ✅ Stream file để tối ưu memory
      const stream = fs.createReadStream(image.filePath);
      stream.pipe(res);
      
    } catch (error) {
      console.error('❌ Serve image error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ Download image (force download)
  app.get('/api/images/:id/download', (req, res) => {
    try {
      const imageId = parseInt(req.params.id);
      const image = triggerDB.getImageById(imageId);
      
      if (!image || !fs.existsSync(image.filePath)) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${image.fileName || 'image.png'}"`);
      res.setHeader('Content-Length', image.fileSize || fs.statSync(image.filePath).size);
      
      fs.createReadStream(image.filePath).pipe(res);
      
    } catch (error) {
      console.error('❌ Download image error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ Get image info (metadata)
  app.get('/api/images/:id/info', (req, res) => {
    try {
      const imageId = parseInt(req.params.id);
      const image = triggerDB.getImageById(imageId);
      
      if (!image) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Get file stats if dimensions not in DB
      let width = image.width;
      let height = image.height;
      let fileSize = image.fileSize;
      
      if (!fileSize && fs.existsSync(image.filePath)) {
        const stats = fs.statSync(image.filePath);
        fileSize = stats.size;
      }
      
      res.json({
        id: image.id,
        name: image.name,
        variableName: image.variableName,
        description: image.description,
        fileName: image.fileName,
        fileSize: fileSize,
        mimeType: image.mimeType,
        width: width,
        height: height,
        createdAt: image.createdAt,
        url: `/api/images/${image.id}`,
        downloadUrl: `/api/images/${image.id}/download`
      });
      
    } catch (error) {
      console.error('❌ Get image info error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ Get image by variable name
  app.get('/api/images/var/:variableName', (req, res) => {
    try {
      const variableName = req.params.variableName;
      const userUID = req.query.userUID;
      
      const db = triggerDB.getDB();
      let image;
      
      if (userUID) {
        image = db.prepare('SELECT * FROM images WHERE variableName = ? AND userUID = ?').get(variableName, userUID);
      } else {
        image = db.prepare('SELECT * FROM images WHERE variableName = ?').get(variableName);
      }
      
      if (!image || !fs.existsSync(image.filePath)) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      res.setHeader('Content-Type', image.mimeType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      fs.createReadStream(image.filePath).pipe(res);
      
    } catch (error) {
      console.error('❌ Serve image by variable error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ✅ OPTIONS handler for CORS
  app.options('/api/images/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  console.log('✅ Image API endpoints registered (Original Quality)');
};