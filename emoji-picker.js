// emoji-picker.js - Simple Emoji Picker Module (FIXED)

const EMOJI_CATEGORIES = {
    'Smileys': ['😀', '😁', '😂', '😃', '😄', '😅', '😆', '😇', '😈', '😉', '😊', '😋', '😌', '😍', '😎', '😏', '😐', '😑', '😒', '😓', '😔', '😕', '😖', '😗', '😘', '😙', '😚', '😛', '😜', '😝', '😞', '😟', '😠', '😡', '😢', '😣', '😤', '😥', '😦', '😧', '😨', '😩', '😪', '😫', '😬', '😭', '😮', '😯', '😰', '😱', '😲', '😳', '😴', '😵', '😶', '😷', '🙁', '🙂', '🙃', '🙄'],
    'Hands': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👍', '👎', '☝️', '👆', '👇', '👈', '👉', '👊', '👏', '🙌', '👐', '🤲', '🤝', '🤜', '🤛'],
    'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌'],
    'Celebration': ['🎉', '🎊', '🎈', '🎁', '🎀', '🎂', '🎃', '🎄', '🎆', '🎇', '✨', '🌟', '⭐', '🎮', '🎯', '🎲', '🎭', '🎪', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🎻'],
    'Food': ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥔', '🍠', '🥐', '🍞', '🥖', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🌮', '🌯', '🥗', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🍤', '🍙', '🍚', '🍘', '🍥', '🍧', '🍨', '🍦', '🍰', '🎂', '🧁', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '☕', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻'],
    'Activity': ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🎳', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '⛳', '🎣', '🎽', '🎿', '⛷️', '🏂', '🛹', '🛷', '🎯', '🎲', '🧩'],
    'Travel': ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '✈️', '🛫', '🛬', '🚁', '🛶', '⛵', '🚤', '🛳️', '🚂', '🚆', '🚇', '🚊'],
    'Nature': ['🌍', '🌎', '🌏', '💧', '⛰️', '🌋', '🗻', '🏔️', '🏕️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁'],
    'Objects': ['💍', '💎', '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💽', '💾', '💿', '📀', '🎥', '📺', '📷', '📸', '📹', '📞', '☎️', '📟', '📠', '📻', '🎙️', '⏰', '🔐', '🔒', '🔓', '🔑', '🗝️', '🔨', '⛏️', '🔧', '🔩', '⚙️']
  };
  
  let currentCategory = 'Smileys';
  
  // ✅ Initialize Emoji Picker
  function initEmojiPicker() {
    // Create emoji picker HTML
    const emojiPickerHTML = `
      <div id="emojiPickerModal" class="emoji-picker-modal" style="display: none;">
        <div class="emoji-picker-content">
          <div class="emoji-picker-header">
            <h3>Chọn Emoji</h3>
            <button onclick="closeEmojiPicker()" class="emoji-picker-close">✕</button>
          </div>
          <div class="emoji-picker-tabs" id="emojiTabs">
            ${Object.keys(EMOJI_CATEGORIES).map(category => `
              <button class="emoji-tab ${category === 'Smileys' ? 'active' : ''}" data-category="${category}" onclick="switchEmojiCategory('${category}', this)">${getCategoryIcon(category)}</button>
            `).join('')}
          </div>
          <div id="emojiPickerContent" class="emoji-picker-container"></div>
        </div>
      </div>
    `;
  
    // Add to body if not exists
    if (!document.getElementById('emojiPickerModal')) {
      document.body.insertAdjacentHTML('beforeend', emojiPickerHTML);
    }
  
    // Add CSS
    addEmojiPickerStyles();
  
    // Load default category
    renderEmojiCategory('Smileys');
  }
  
  // ✅ Get category icon
  function getCategoryIcon(category) {
    const icons = {
      'Smileys': '😊',
      'Hands': '👋',
      'Hearts': '❤️',
      'Celebration': '🎉',
      'Food': '🍕',
      'Activity': '⚽',
      'Travel': '✈️',
      'Nature': '🌿',
      'Objects': '📱'
    };
    return icons[category] || '😊';
  }
  
  // ✅ Render emoji category (helper function)
  function renderEmojiCategory(category) {
    const content = document.getElementById('emojiPickerContent');
    if (!content) return;
    
    const emojis = EMOJI_CATEGORIES[category] || [];
    content.innerHTML = emojis.map(emoji => `
      <span class="emoji-item" onclick="insertEmoji('${emoji}')">${emoji}</span>
    `).join('');
  }
  
  // ✅ Switch emoji category - FIXED: Pass button element directly
  function switchEmojiCategory(category, buttonElement) {
    currentCategory = category;
    
    // Update active tab
    document.querySelectorAll('.emoji-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    if (buttonElement) {
      buttonElement.classList.add('active');
    }
  
    // Render emojis
    renderEmojiCategory(category);
  }
  
  // ✅ Open emoji picker
  function openEmojiPicker() {
    const modal = document.getElementById('emojiPickerModal');
    if (modal) {
      modal.style.display = 'flex';
      renderEmojiCategory(currentCategory);
    } else {
      initEmojiPicker();
      setTimeout(() => {
        const m = document.getElementById('emojiPickerModal');
        if (m) m.style.display = 'flex';
      }, 100);
    }
  }
  
  // ✅ Close emoji picker
  function closeEmojiPicker() {
    const modal = document.getElementById('emojiPickerModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }
  
  // ✅ Insert emoji into textarea
  function insertEmoji(emoji) {
    const textarea = document.getElementById('messageInput');
    if (textarea) {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const text = textarea.value;
      
      textarea.value = text.substring(0, start) + emoji + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
    }
    
    closeEmojiPicker();
  }
  
  // ✅ Add CSS styles
  function addEmojiPickerStyles() {
    if (document.getElementById('emojiPickerStyles')) return;
  
    const styles = `
      .emoji-picker-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        align-items: center;
        justify-content: center;
      }
  
      .emoji-picker-content {
        background: white;
        border-radius: 12px;
        width: 90%;
        max-width: 400px;
        max-height: 500px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        animation: slideUp 0.3s ease;
      }
  
      @keyframes slideUp {
        from {
          transform: translateY(50px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
  
      .emoji-picker-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #e0e0e0;
      }
  
      .emoji-picker-header h3 {
        margin: 0;
        font-size: 16px;
        color: #333;
      }
  
      .emoji-picker-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }
  
      .emoji-picker-close:hover {
        background: #f0f0f0;
      }
  
      .emoji-picker-tabs {
        display: flex;
        gap: 4px;
        padding: 8px 12px;
        border-bottom: 1px solid #e0e0e0;
        overflow-x: auto;
      }
  
      .emoji-tab {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 6px 8px;
        border-radius: 6px;
        transition: background 0.2s;
        flex-shrink: 0;
      }
  
      .emoji-tab:hover {
        background: #f0f0f0;
      }
  
      .emoji-tab.active {
        background: #e8eaf6;
      }
  
      .emoji-picker-container {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
        padding: 12px;
        overflow-y: auto;
        flex: 1;
        max-height: 300px;
      }
  
      .emoji-item {
        font-size: 22px;
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        text-align: center;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
  
      .emoji-item:hover {
        background: #f0f0f0;
        transform: scale(1.2);
      }
  
      @media (max-width: 500px) {
        .emoji-picker-content {
          width: 95%;
          max-height: 60vh;
        }
  
        .emoji-picker-container {
          grid-template-columns: repeat(6, 1fr);
        }
      }
    `;
  
    const styleElement = document.createElement('style');
    styleElement.id = 'emojiPickerStyles';
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }
  
  // ✅ Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initEmojiPicker();
  });