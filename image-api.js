// image-api.js - API endpoint để serve images
// Thêm vào server.js: require('./image-api')(app, triggerDB);

const path = require('path');
const fs = require('fs');

module.exports = function(app, triggerDB) {
  // Serve image by ID
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
      
      // Set content type
      res.setHeader('Content-Type', image.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 day
      
      // Send file
      res.sendFile(image.filePath);
      
    } catch (error) {
      console.error('❌ Serve image error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get image info
  app.get('/api/images/:id/info', (req, res) => {
    try {
      const imageId = parseInt(req.params.id);
      const image = triggerDB.getImageById(imageId);
      
      if (!image) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      res.json({
        id: image.id,
        name: image.name,
        variableName: image.variableName,
        description: image.description,
        fileName: image.fileName,
        fileSize: image.fileSize,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        createdAt: image.createdAt,
        url: `/api/images/${image.id}`
      });
      
    } catch (error) {
      console.error('❌ Get image info error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Get image by variable name
  app.get('/api/images/var/:variableName', (req, res) => {
    try {
      const variableName = req.params.variableName;
      const userUID = req.query.userUID; // Optional user filter
      
      // Search in database
      const db = triggerDB.getDB();
      let image;
      
      if (userUID) {
        image = db.prepare('SELECT * FROM images WHERE variableName = ? AND userUID = ?').get(variableName, userUID);
      } else {
        image = db.prepare('SELECT * FROM images WHERE variableName = ?').get(variableName);
      }
      
      if (!image) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Check if file exists
      if (!fs.existsSync(image.filePath)) {
        return res.status(404).json({ error: 'Image file not found' });
      }
      
      // Set content type
      res.setHeader('Content-Type', image.mimeType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      
      // Send file
      res.sendFile(image.filePath);
      
    } catch (error) {
      console.error('❌ Serve image by variable error:', error.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  console.log('✅ Image API endpoints registered');
};