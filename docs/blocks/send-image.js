// public/blocks/send-image.js
// Block: Gửi hình ảnh - Hỗ trợ URL và thư viện ảnh

(function() {
  'use strict';

  // API Base URL - luôn dùng port 3000 cho images API
  var API_BASE_URL = 'http://' + (location.hostname || 'localhost') + ':3000';

  // Helper function để tạo image URL
  function getImageUrl(img) {
    if (img.url && img.url.startsWith('http')) {
      return img.url;
    }
    return API_BASE_URL + '/api/images/' + (img.id || img.imageID);
  }

  FlowBuilder.registerBlock('send-image', {
    type: 'send-image',
    name: 'Gửi hình ảnh',
    desc: 'Gửi ảnh từ thư viện hoặc URL',
    icon: '🖼️',
    category: 'message',
    color: '#e3f2fd',
    
    defaultData: { 
      enabled: true,
      sourceType: 'library', // 'library', 'url', 'variable'
      imageId: null,
      imageUrl: '', 
      imageVariable: '',
      caption: '' 
    },

    renderForm: function(block, data, context) {
      var images = window.uploadedImages || [];
      var selectedImage = images.find(function(img) { return img.id == data.imageId; });
      
      console.log('🖼️ Send Image renderForm:', {
        sourceType: data.sourceType,
        imageId: data.imageId,
        images: images.length,
        API_BASE_URL: API_BASE_URL
      });

      var html = '';

      // Toggle Enable
      html += '<div class="property-group" style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:#e3f2fd;border-radius:8px;">';
      html += '<span style="font-weight:600;">🔌 Kích hoạt block</span>';
      html += '<label class="toggle-switch">';
      html += '<input type="checkbox" id="prop_enabled" ' + (data.enabled !== false ? 'checked' : '') + '>';
      html += '<span class="toggle-slider"></span>';
      html += '</label>';
      html += '</div>';

      // Source Type Selection
      html += '<div class="property-group">';
      html += '<label class="property-label">📷 Nguồn ảnh</label>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      
      var sources = [
        { value: 'library', label: '📚 Thư viện', desc: 'Chọn từ ảnh đã upload' },
        { value: 'url', label: '🔗 URL', desc: 'Nhập link ảnh' },
        { value: 'variable', label: '📝 Biến', desc: 'Dùng biến ảnh' }
      ];
      
      sources.forEach(function(src) {
        var isSelected = (data.sourceType || 'library') === src.value;
        html += '<label class="source-option" style="flex:1;min-width:100px;padding:12px;border:2px solid ' + (isSelected ? '#1976d2' : '#e0e0e0') + ';border-radius:10px;cursor:pointer;text-align:center;background:' + (isSelected ? '#e3f2fd' : 'white') + ';transition:all 0.2s;">';
        html += '<input type="radio" name="sourceType" value="' + src.value + '" ' + (isSelected ? 'checked' : '') + ' style="display:none;" onchange="FlowBuilder.onImageSourceChange(this.value)">';
        html += '<div style="font-size:16px;margin-bottom:4px;">' + src.label + '</div>';
        html += '<div style="font-size:11px;color:#888;">' + src.desc + '</div>';
        html += '</label>';
      });
      
      html += '</div>';
      html += '</div>';

      // Library Selection
      var showLibrary = (data.sourceType || 'library') === 'library';
      html += '<div class="property-group" id="librarySection" style="' + (showLibrary ? '' : 'display:none;') + '">';
      html += '<label class="property-label">🖼️ Chọn ảnh từ thư viện</label>';
      
      if (images.length === 0) {
        html += '<div style="padding:24px;background:#fff3e0;border-radius:8px;text-align:center;">';
        html += '<div style="font-size:32px;margin-bottom:8px;">📷</div>';
        html += '<div style="color:#666;margin-bottom:12px;">Chưa có ảnh nào trong thư viện</div>';
        html += '<a href="/image-manager.html" target="_blank" class="btn-small" style="display:inline-block;padding:8px 16px;background:#1976d2;color:white;border-radius:6px;text-decoration:none;">➕ Tải ảnh lên</a>';
        html += '</div>';
      } else {
        html += '<div class="image-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;max-height:300px;overflow-y:auto;padding:4px;">';
        images.forEach(function(img) {
          var isSelected = data.imageId == img.id;
          var imgUrl = getImageUrl(img);
          html += '<div class="image-item" onclick="FlowBuilder.selectLibraryImage(' + img.id + ')" style="cursor:pointer;border:3px solid ' + (isSelected ? '#1976d2' : 'transparent') + ';border-radius:8px;overflow:hidden;transition:all 0.2s;' + (isSelected ? 'box-shadow:0 4px 12px rgba(25,118,210,0.3);' : '') + '">';
          html += '<img src="' + imgUrl + '" alt="' + FlowBuilder.escapeHtml(img.name) + '" style="width:100%;height:80px;object-fit:cover;" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2280%22><rect fill=%22%23f0f0f0%22 width=%22100%22 height=%2280%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22>❌</text></svg>\'">';
          html += '<div style="padding:4px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:' + (isSelected ? '#e3f2fd' : '#f5f5f5') + ';">' + FlowBuilder.escapeHtml(img.name) + '</div>';
          html += '</div>';
        });
        html += '</div>';
        html += '<div style="margin-top:8px;"><a href="/image-manager.html" target="_blank" style="font-size:12px;color:#1976d2;">📁 Quản lý thư viện ảnh →</a></div>';
      }
      html += '<input type="hidden" id="prop_imageId" value="' + (data.imageId || '') + '">';
      html += '</div>';

      // Show selected image preview
      if (selectedImage && showLibrary) {
        var selectedImgUrl = getImageUrl(selectedImage);
        html += '<div class="property-info" style="background:#e3f2fd;padding:12px;border-radius:8px;margin-bottom:16px;display:flex;gap:12px;align-items:center;">';
        html += '<img src="' + selectedImgUrl + '" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" onerror="this.style.display=\'none\'">';
        html += '<div>';
        html += '<div style="font-weight:600;">' + FlowBuilder.escapeHtml(selectedImage.name) + '</div>';
        if (selectedImage.variableName) {
          html += '<div style="font-size:12px;"><code style="background:#c8e6c9;padding:2px 6px;border-radius:4px;">{' + FlowBuilder.escapeHtml(selectedImage.variableName) + '}</code></div>';
        }
        html += '</div>';
        html += '</div>';
      }

      // URL Input
      var showUrl = data.sourceType === 'url';
      html += '<div class="property-group" id="urlSection" style="' + (showUrl ? '' : 'display:none;') + '">';
      html += '<label class="property-label">🔗 URL hình ảnh <span class="required">*</span></label>';
      html += '<input class="property-input" id="prop_imageUrl" value="' + FlowBuilder.escapeHtml(data.imageUrl || '') + '" placeholder="https://example.com/image.jpg">';
      html += '<div class="property-hint">Hỗ trợ: JPG, PNG, GIF, WebP. Có thể dùng biến: {image_url}</div>';
      html += '</div>';

      // Variable Input
      var showVar = data.sourceType === 'variable';
      html += '<div class="property-group" id="variableSection" style="' + (showVar ? '' : 'display:none;') + '">';
      html += '<label class="property-label">📝 Tên biến ảnh <span class="required">*</span></label>';
      html += '<input class="property-input" id="prop_imageVariable" value="' + FlowBuilder.escapeHtml(data.imageVariable || '') + '" placeholder="img_welcome">';
      html += '<div class="property-hint">Nhập tên biến đã gán trong Image Manager. VD: <code>img_welcome</code></div>';
      html += '</div>';

      // Caption
      html += '<div class="property-group">';
      html += '<label class="property-label">💬 Caption (tùy chọn)</label>';
      html += '<input class="property-input" id="prop_caption" value="' + FlowBuilder.escapeHtml(data.caption || '') + '" placeholder="Mô tả hình ảnh...">';
      html += '<div class="property-hint">Văn bản gửi kèm ảnh. Hỗ trợ biến: {sender_name}, {message}</div>';
      html += '</div>';

      return html;
    },

    saveForm: function() {
      var sourceType = document.querySelector('input[name="sourceType"]:checked')?.value || 'library';
      
      return {
        blockData: {
          enabled: document.getElementById('prop_enabled')?.checked !== false,
          sourceType: sourceType,
          imageId: parseInt(document.getElementById('prop_imageId')?.value) || null,
          imageUrl: document.getElementById('prop_imageUrl')?.value || '',
          imageVariable: document.getElementById('prop_imageVariable')?.value || '',
          caption: document.getElementById('prop_caption')?.value || ''
        }
      };
    },

    preview: function(data) {
      if (data.enabled === false) return '⏸️ Đã tắt';
      
      var sourceType = data.sourceType || 'library';
      
      if (sourceType === 'library') {
        if (!data.imageId) return '⚠️ Chưa chọn ảnh';
        var images = window.uploadedImages || [];
        var img = images.find(function(i) { return i.id == data.imageId; });
        return '🖼️ ' + (img ? img.name : 'Ảnh #' + data.imageId);
      }
      
      if (sourceType === 'url') {
        if (!data.imageUrl) return '⚠️ Chưa có URL';
        return '🔗 ' + data.imageUrl.substring(0, 30) + '...';
      }
      
      if (sourceType === 'variable') {
        if (!data.imageVariable) return '⚠️ Chưa có biến';
        return '📝 {' + data.imageVariable + '}';
      }
      
      return '🖼️ Gửi ảnh';
    }
  });

  // ========================================
  // EVENT HANDLERS
  // ========================================
  
  // Change source type
  FlowBuilder.onImageSourceChange = function(value) {
    document.getElementById('librarySection').style.display = value === 'library' ? '' : 'none';
    document.getElementById('urlSection').style.display = value === 'url' ? '' : 'none';
    document.getElementById('variableSection').style.display = value === 'variable' ? '' : 'none';
    
    // Update radio button styles
    document.querySelectorAll('.source-option').forEach(function(opt) {
      var input = opt.querySelector('input');
      var isSelected = input.value === value;
      opt.style.borderColor = isSelected ? '#1976d2' : '#e0e0e0';
      opt.style.background = isSelected ? '#e3f2fd' : 'white';
    });
  };

  // Select image from library
  FlowBuilder.selectLibraryImage = function(imageId) {
    document.getElementById('prop_imageId').value = imageId;
    
    // Update UI
    document.querySelectorAll('.image-item').forEach(function(item) {
      item.style.borderColor = 'transparent';
      item.style.boxShadow = 'none';
      item.querySelector('div').style.background = '#f5f5f5';
    });
    
    event.currentTarget.style.borderColor = '#1976d2';
    event.currentTarget.style.boxShadow = '0 4px 12px rgba(25,118,210,0.3)';
    event.currentTarget.querySelector('div').style.background = '#e3f2fd';
  };

  // Expose getImageUrl for other modules
  FlowBuilder.getImageUrl = getImageUrl;

  console.log('  ✓ Block send-image registered (API_BASE_URL:', API_BASE_URL, ')');

})();