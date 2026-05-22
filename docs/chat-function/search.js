// search.js - FIX: Sử dụng đúng element IDs từ dashboard.html
let searchTimeout = null;
let isSearchingPhone = false;

function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  return str;
}

function smartSearch(text, query) {
  if (!text || !query) return false;
  
  const normalizedText = removeVietnameseTones(text.toLowerCase());
  const normalizedQuery = removeVietnameseTones(query.toLowerCase());
  
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
  
  return queryWords.every(word => normalizedText.includes(word));
}

function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text);
  
  const normalizedQuery = removeVietnameseTones(query.toLowerCase());
  const words = normalizedQuery.split(/\s+/).filter(w => w.length > 0);
  
  let result = escapeHtml(text);
  
  words.forEach(word => {
    if (word.length < 2) return;
    const regex = new RegExp(`(${escapeRegex(word)})`, 'gi');
    result = result.replace(regex, '<span class="highlight">$1</span>');
  });
  
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeJs(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ✅ Hàm searchFriends được gọi từ onkeyup trong dashboard.html
function searchFriends(query) {
  console.log(`🔍 Searching friends: "${query}"`);
  const resultsDiv = document.getElementById('friendsResults');
  
  if (!query || query.trim() === '') {
    resultsDiv.innerHTML = '';
    // Reset về danh sách đầy đủ
    if (typeof friends !== 'undefined' && typeof filteredFriends !== 'undefined') {
      filteredFriends = [...friends];
      if (typeof renderFriendsVirtual === 'function') {
        renderFriendsVirtual();
      }
    }
    return;
  }
  
  // Kiểm tra nếu là số điện thoại
  const isPhone = /^(\+84|84|0)?[0-9]{8,10}$/.test(query.trim());
  
  if (isPhone && query.length >= 9) {
    // Tìm qua số điện thoại
    searchByPhone(query.trim(), resultsDiv);
    return;
  }
  
  // Tìm trong danh sách bạn bè
  searchInFriendsList(query.trim(), resultsDiv);
}

function searchInFriendsList(query, resultsDiv) {
  if (typeof allFriends === 'undefined' || !allFriends) {
    console.warn('⚠️ allFriends not defined');
    return;
  }
  
  const lowerQuery = query.toLowerCase();
  const results = allFriends.filter(f => {
    const displayName = f.displayName || '';
    const userId = f.userId || '';
    
    return smartSearch(displayName, query) || 
           userId.toLowerCase().includes(lowerQuery) ||
           displayName.toLowerCase().includes(lowerQuery);
  });
  
  console.log(`✅ Found ${results.length} friends`);
  
  // Cập nhật filteredFriends và render
  if (typeof filteredFriends !== 'undefined') {
    filteredFriends = results;
    if (typeof renderFriendsVirtual === 'function') {
      renderFriendsVirtual();
    }
  }
  
  if (results.length === 0) {
    resultsDiv.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #999;">
        <div style="font-size: 24px; margin-bottom: 8px;">😕</div>
        <div>Không tìm thấy bạn bè với từ khóa "${escapeHtml(query)}"</div>
      </div>
    `;
    return;
  }
  
  // Hiển thị kết quả (tối đa 10)
  const displayResults = results.slice(0, 10);
  let html = `
    <div style="padding: 8px 12px; background: #f5f5f5; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">
      👥 Tìm thấy ${results.length} kết quả ${results.length > 10 ? `(hiển thị 10)` : ''}
    </div>
  `;
  
  for (const friend of displayResults) {
    html += `
      <div class="search-result-item" onclick="selectFriendFromSearch('${friend.userId}', '${escapeJs(friend.displayName)}', '${friend.avatar}')">
        <div class="result-friend">
          <img src="${friend.avatar || 'https://via.placeholder.com/50'}" 
               onerror="this.src='https://via.placeholder.com/50'"
               alt="Avatar"
               onclick="event.stopPropagation(); showFriendDetailsModal('${friend.userId}', '${escapeJs(friend.displayName || 'Người dùng Zalo')}', '${friend.avatar || ''}', false)"
               style="cursor:pointer;">
          <div class="result-friend-info">
            <div class="result-friend-name">
              ${highlightText(friend.displayName || 'Người dùng Zalo', query)}
              ${friend.tag ? `<span class="friend-tag-badge" style="display:inline-block; font-size:10px; background:#2ec4b6; color:white; padding:2px 8px; border-radius:10px; font-weight:500; margin-left:6px; vertical-align:middle;">${escapeHtml(friend.tag)}</span>` : ''}
            </div>
            <div class="result-friend-uid">UID: ${friend.userId}</div>
          </div>
        </div>
      </div>
    `;
  }
  
  resultsDiv.innerHTML = html;
}

function searchByPhone(phone, resultsDiv) {
  console.log('📱 Tìm user với số:', phone);
  isSearchingPhone = true;
  
  resultsDiv.innerHTML = `
    <div style="padding: 12px; background: #e3f2fd; border-bottom: 1px solid #bbdefb;">
      <strong>📱 Đang tìm qua số điện thoại...</strong>
    </div>
    <div style="padding: 30px; text-align: center;">
      <div class="spinner" style="margin: 0 auto 10px;"></div>
      <div style="color: #666;">Đang tìm người dùng...</div>
    </div>
  `;

  if (typeof ws !== 'undefined' && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'find_user',
      phone: phone
    }));
  } else {
    resultsDiv.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #f44336;">
        ❌ WebSocket chưa kết nối
      </div>
    `;
  }
}

// ✅ Xử lý kết quả tìm kiếm qua số điện thoại (gọi từ ws.onmessage)
function handlePhoneSearchResult(user) {
  const resultsDiv = document.getElementById('friendsResults');
  if (!resultsDiv) return;
  
  isSearchingPhone = false;
  
  const gender = user.gender === 2 ? 'Nam' : user.gender === 1 ? 'Nữ' : 'Không rõ';
  const displayName = user.display_name || user.zalo_name || 'Người dùng Zalo';
  
  resultsDiv.innerHTML = `
    <div style="padding: 8px 12px; background: #e8f5e9; border-bottom: 1px solid #c8e6c9; font-size: 12px; color: #388e3c;">
      📱 Tìm thấy từ số điện thoại
    </div>
    <div class="search-result-item" onclick="selectFriendFromSearch('${user.uid}', '${escapeJs(displayName)}', '${user.avatar || ''}')">
      <div class="result-friend">
        <img src="${user.avatar || 'https://via.placeholder.com/50'}" 
             onerror="this.src='https://via.placeholder.com/50'"
             alt="Avatar"
             onclick="event.stopPropagation(); showFriendDetailsModal('${user.uid}', '${escapeJs(displayName)}', '${user.avatar || ''}', true)"
             style="cursor:pointer;">
        <div class="result-friend-info">
          <div class="result-friend-name">${escapeHtml(displayName)}</div>
          <div class="result-friend-uid">${gender} • UID: ${user.uid}</div>
        </div>
        <span style="background: #e8f5e9; color: #388e3c; padding: 2px 8px; border-radius: 10px; font-size: 11px;">Từ SĐT</span>
      </div>
    </div>
  `;
}

function handlePhoneSearchNotFound() {
  const resultsDiv = document.getElementById('friendsResults');
  if (!resultsDiv) return;
  
  isSearchingPhone = false;
  
  resultsDiv.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #999;">
      <div style="font-size: 24px; margin-bottom: 8px;">😕</div>
      <div>Không tìm thấy người dùng với số điện thoại này</div>
    </div>
  `;
}

function handlePhoneSearchError(error) {
  const resultsDiv = document.getElementById('friendsResults');
  if (!resultsDiv) return;
  
  isSearchingPhone = false;
  
  resultsDiv.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #f44336;">
      <div style="font-size: 24px; margin-bottom: 8px;">❌</div>
      <div>Lỗi: ${escapeHtml(error || 'Không thể tìm kiếm')}</div>
    </div>
  `;
}

// ✅ Chọn bạn bè từ kết quả tìm kiếm
function selectFriendFromSearch(userId, displayName, avatar) {
  // Xóa kết quả tìm kiếm
  const resultsDiv = document.getElementById('friendsResults');
  if (resultsDiv) {
    resultsDiv.innerHTML = '';
  }
  
  // Xóa input
  const searchInput = document.getElementById('friendsSearchInput');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // Reset danh sách
  if (typeof friends !== 'undefined' && typeof filteredFriends !== 'undefined') {
    filteredFriends = [...friends];
    if (typeof renderFriendsVirtual === 'function') {
      renderFriendsVirtual();
    }
  }
  
  // Chọn friend
  if (typeof selectFriend === 'function') {
    selectFriend(userId, displayName, avatar);
  }
}

// ✅ Thêm CSS cho search results
(function addSearchStyles() {
  if (document.getElementById('searchStyles')) return;
  
  const style = document.createElement('style');
  style.id = 'searchStyles';
  style.textContent = `
    .search-result-item {
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s;
    }
    
    .search-result-item:hover {
      background: #f5f5f5;
    }
    
    .result-friend {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .result-friend img {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
    }
    
    .result-friend-info {
      flex: 1;
    }
    
    .result-friend-name {
      font-weight: 500;
      color: #333;
    }
    
    .result-friend-uid {
      font-size: 12px;
      color: #999;
      margin-top: 2px;
    }
    
    .highlight {
      background: #fff3cd;
      padding: 0 2px;
      border-radius: 2px;
    }
    
    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #0068ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    #friendsResults {
      max-height: 400px;
      overflow-y: auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
  `;
  document.head.appendChild(style);
})();

console.log('✅ search.js loaded');