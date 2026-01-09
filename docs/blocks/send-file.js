// public/blocks/send-file.js
// Block: Gửi file - Hỗ trợ chọn từ thư viện

(function() {
  'use strict';

  // API Base URL
  var API_BASE_URL = 'http://' + (location.hostname || 'localhost') + ':3000';

  // File icons
  var FILE_ICONS = {
    pdf: '📄', word: '📝', excel: '📊', powerpoint: '📽️',
    text: '📃', csv: '📊', archive: '📦', audio: '🎵',
    video: '🎬', image: '🖼️', other: '📎'
  };

  // Helper: Get file URL
  function getFileUrl(file) {
    if (file.url && file.url.startsWith('http')) return file.url;
    return API_BASE_URL + '/api/files/' + (file.id || file.fileID);
  }

  // Helper: Get file icon
  function getFileIcon(fileType) {
    return FILE_ICONS[fileType] || '📎';
  }

  // Helper: Format file size
  function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  }

  FlowBuilder.registerBlock('send-file', {
    type: 'send-file',
    name: 'Gửi file',
    desc: 'Gửi file đính kèm từ thư viện hoặc URL',
    icon: '📎',
    category: 'message',
    color: '#e3f2fd',
    
    defaultData: { 
      sourceType: 'library',  // library, url, variable
      fileId: '',
      fileUrl: '',
      fileVariable: '',
      fileName: '',
      caption: '',
      enabled: true
    },

    renderForm: function(block, data, context) {
      var sourceType = data.sourceType || 'library';
      var uploadedFiles = window.uploadedFiles || [];
      
      // Build file options
      var fileOptions = '<option value="">-- Chọn file --</option>';
      uploadedFiles.forEach(function(file) {
        var icon = getFileIcon(file.fileType);
        var selected = (data.fileId == file.id) ? ' selected' : '';
        var size = formatFileSize(file.fileSize);
        fileOptions += '<option value="' + file.id + '"' + selected + '>' + 
          icon + ' ' + FlowBuilder.escapeHtml(file.name) + ' (' + size + ')</option>';
      });

      // Selected file preview
      var selectedFile = uploadedFiles.find(function(f) { return f.id == data.fileId; });
      var filePreview = '';
      if (selectedFile) {
        var icon = getFileIcon(selectedFile.fileType);
        filePreview = '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;margin-top:8px">' +
          '<span style="font-size:32px">' + icon + '</span>' +
          '<div style="flex:1">' +
            '<div style="font-weight:600">' + FlowBuilder.escapeHtml(selectedFile.name) + '</div>' +
            '<div style="font-size:11px;color:#888">' + FlowBuilder.escapeHtml(selectedFile.fileName) + ' • ' + formatFileSize(selectedFile.fileSize) + '</div>' +
          '</div>' +
          '<a href="' + getFileUrl(selectedFile) + '" target="_blank" style="color:#1976d2;font-size:12px">Xem</a>' +
        '</div>';
      }

      return '\
        <div class="property-group">\
          <label class="property-label">Nguồn file</label>\
          <select class="property-select" id="prop_sourceType" onchange="FlowBuilder.updateBlockUI()">\
            <option value="library"' + (sourceType === 'library' ? ' selected' : '') + '>📁 Chọn từ thư viện</option>\
            <option value="url"' + (sourceType === 'url' ? ' selected' : '') + '>🔗 Nhập URL</option>\
            <option value="variable"' + (sourceType === 'variable' ? ' selected' : '') + '>📝 Từ biến</option>\
          </select>\
        </div>\
        \
        <div id="library_section" style="display:' + (sourceType === 'library' ? 'block' : 'none') + '">\
          <div class="property-group">\
            <label class="property-label">Chọn file <span class="required">*</span></label>\
            <select class="property-select" id="prop_fileId" onchange="FlowBuilder.updateFilePreview()">\
              ' + fileOptions + '\
            </select>\
            <div id="file_preview">' + filePreview + '</div>\
            <div style="margin-top:8px">\
              <a href="./public/file-manager.html" target="_blank" style="color:#11998e;font-size:12px">📁 Mở File Manager</a>\
              <button type="button" onclick="FlowBuilder.refreshFiles()" style="margin-left:12px;padding:4px 8px;font-size:11px;border:1px solid #ddd;border-radius:4px;cursor:pointer">🔄 Làm mới</button>\
            </div>\
          </div>\
        </div>\
        \
        <div id="url_section" style="display:' + (sourceType === 'url' ? 'block' : 'none') + '">\
          <div class="property-group">\
            <label class="property-label">URL file <span class="required">*</span></label>\
            <input class="property-input" id="prop_fileUrl" value="' + FlowBuilder.escapeHtml(data.fileUrl || '') + '" \
              placeholder="https://example.com/document.pdf">\
            <div class="property-hint">Hỗ trợ biến: {file_url}</div>\
          </div>\
        </div>\
        \
        <div id="variable_section" style="display:' + (sourceType === 'variable' ? 'block' : 'none') + '">\
          <div class="property-group">\
            <label class="property-label">Tên biến <span class="required">*</span></label>\
            <input class="property-input" id="prop_fileVariable" value="' + FlowBuilder.escapeHtml(data.fileVariable || '') + '" \
              placeholder="file_hopdong">\
            <div class="property-hint">Biến chứa URL hoặc ID file</div>\
          </div>\
        </div>\
        \
        <div class="property-group">\
          <label class="property-label">Tên file hiển thị</label>\
          <input class="property-input" id="prop_fileName" value="' + FlowBuilder.escapeHtml(data.fileName || '') + '" \
            placeholder="Để trống sẽ dùng tên gốc">\
        </div>\
        \
        <div class="property-group">\
          <label class="property-label">Chú thích</label>\
          <textarea class="property-textarea" id="prop_caption" rows="2" \
            placeholder="Vui lòng xem file đính kèm...">' + FlowBuilder.escapeHtml(data.caption || '') + '</textarea>\
          <div class="property-hint">Hỗ trợ biến: {sender_name}, {customer_name}...</div>\
        </div>\
        \
        <div class="property-group">\
          <label class="toggle-label">\
            <input type="checkbox" id="prop_enabled" ' + (data.enabled !== false ? 'checked' : '') + '>\
            <span>Kích hoạt block này</span>\
          </label>\
        </div>\
      ';
    },

    saveForm: function() {
      var sourceType = document.getElementById('prop_sourceType').value;
      
      return {
        blockData: {
          sourceType: sourceType,
          fileId: sourceType === 'library' ? document.getElementById('prop_fileId').value : '',
          fileUrl: sourceType === 'url' ? document.getElementById('prop_fileUrl').value : '',
          fileVariable: sourceType === 'variable' ? document.getElementById('prop_fileVariable').value : '',
          fileName: document.getElementById('prop_fileName').value,
          caption: document.getElementById('prop_caption').value,
          enabled: document.getElementById('prop_enabled').checked
        }
      };
    },

    preview: function(data) {
      if (data.enabled === false) return '⏸️ (Tắt)';
      
      var sourceType = data.sourceType || 'library';
      
      if (sourceType === 'library') {
        if (!data.fileId) return '⚠️ Chưa chọn file';
        var uploadedFiles = window.uploadedFiles || [];
        var file = uploadedFiles.find(function(f) { return f.id == data.fileId; });
        if (file) {
          var icon = getFileIcon(file.fileType);
          return icon + ' ' + file.name;
        }
        return '📎 File #' + data.fileId;
      }
      
      if (sourceType === 'url') {
        if (!data.fileUrl) return '⚠️ Chưa có URL';
        return '🔗 ' + (data.fileName || 'URL file');
      }
      
      if (sourceType === 'variable') {
        if (!data.fileVariable) return '⚠️ Chưa có biến';
        return '📝 {' + data.fileVariable + '}';
      }
      
      return '📎 File';
    },

    onInit: function() {
      // Load files when block is opened
      if (typeof FlowBuilder !== 'undefined') {
        FlowBuilder.loadFiles();
      }
    }
  });

  // ========================================
  // EXTEND FLOWBUILDER
  // ========================================

  if (typeof FlowBuilder !== 'undefined') {
    // Load files từ server
    FlowBuilder.loadFiles = function() {
      if (window.flowBuilderWS && window.flowBuilderWS.readyState === WebSocket.OPEN) {
        window.flowBuilderWS.send(JSON.stringify({ type: 'get_files' }));
      }
    };

    // Refresh files
    FlowBuilder.refreshFiles = function() {
      FlowBuilder.loadFiles();
      if (typeof toast === 'function') {
        toast('🔄 Đang tải danh sách file...', 'info');
      }
    };

    // Update UI when source type changes
    FlowBuilder.updateBlockUI = function() {
      var sourceType = document.getElementById('prop_sourceType').value;
      
      document.getElementById('library_section').style.display = sourceType === 'library' ? 'block' : 'none';
      document.getElementById('url_section').style.display = sourceType === 'url' ? 'block' : 'none';
      document.getElementById('variable_section').style.display = sourceType === 'variable' ? 'block' : 'none';
    };

    // Update file preview
    FlowBuilder.updateFilePreview = function() {
      var fileId = document.getElementById('prop_fileId').value;
      var previewDiv = document.getElementById('file_preview');
      
      if (!fileId) {
        previewDiv.innerHTML = '';
        return;
      }
      
      var uploadedFiles = window.uploadedFiles || [];
      var file = uploadedFiles.find(function(f) { return f.id == fileId; });
      
      if (file) {
        var icon = getFileIcon(file.fileType);
        previewDiv.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;margin-top:8px">' +
          '<span style="font-size:32px">' + icon + '</span>' +
          '<div style="flex:1">' +
            '<div style="font-weight:600">' + FlowBuilder.escapeHtml(file.name) + '</div>' +
            '<div style="font-size:11px;color:#888">' + FlowBuilder.escapeHtml(file.fileName) + ' • ' + formatFileSize(file.fileSize) + '</div>' +
          '</div>' +
          '<a href="' + getFileUrl(file) + '" target="_blank" style="color:#1976d2;font-size:12px">Xem</a>' +
        '</div>';
      } else {
        previewDiv.innerHTML = '';
      }
    };
  }

})();