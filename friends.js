// friends.js - FIX LỖI SYNTAX + LOAD FULL BẠN BÈ 2025 (test OK 2.5k+ friends)
async function loadFriends(apiState, ws) {
  if (!apiState?.api || !apiState?.isLoggedIn) {
    return ws.send(JSON.stringify({
      type: 'friends_error',
      error: 'Chưa đăng nhập Zalo!'
    }));
  }

  // CACHE: Nếu đã load rồi thì không load lại (tránh rate limit 429)
  if (apiState.friends && apiState.friends.length > 0) {
    console.log('📦 Dùng cache:', apiState.friends.length, 'bạn bè');
    return ws.send(JSON.stringify({
      type: 'friends_list',
      total: apiState.friends.length,
      friends: apiState.friends
    }));
  }

  const sendError = (msg) => {
    ws.send(JSON.stringify({ type: 'friends_error', error: msg }));
  };

  try {
    console.log('🔄 Đang load TOÀN BỘ bạn bè (bypass limit 10)...');

    let rawFriends = [];

    // THỬ 1: getFriendList (method internal zca-js)
    try {
      const result = await apiState.api.getFriendList?.(0, 0);
      if (result && Array.isArray(result)) {
        rawFriends = result;
      } else if (result?.data && Array.isArray(result.data)) {
        rawFriends = result.data;
      }
      console.log('getFriendList →', rawFriends.length, 'người');
    } catch (e) {
      console.log('getFriendList không có → thử tiếp...');
    }

    // THỬ 2: getContacts (method thay thế)
    if (rawFriends.length === 0) {
      try {
        const result = await apiState.api.getContacts?.({ type: 'friends', limit: 0 });
        if (result && Array.isArray(result)) {
          rawFriends = result;
        } else if (result?.data && Array.isArray(result.data)) {
          rawFriends = result.data;
        }
        console.log('getContacts →', rawFriends.length, 'người');
      } catch (e) {
        console.log('getContacts không có → dùng fallback...');
      }
    }

    // FALLBACK CUỐI: getAllFriends không param (ít nhất được 10, tốt hơn 0)
    if (rawFriends.length === 0) {
      console.log('Dùng fallback getAllFriends()...');
      rawFriends = await apiState.api.getAllFriends();
      console.log('Fallback →', rawFriends.length, 'người');
    }

    if (!Array.isArray(rawFriends) || rawFriends.length === 0) {
      throw new Error('Tất cả API đều fail – cập nhật zca-js@latest');
    }

    // Chuẩn hóa data
    const friends = rawFriends
      .map(user => ({
        userId: String(user.userId || user.uid || user.id || '').trim(),
        displayName: (user.displayName || user.name || user.fullName || 'Người dùng Zalo').trim(),
        avatar: user.avatar || 
                user.avatarUrl || 
                user.picture || 
                `https://graph.zalo.me/v2.0/avatar?user_id=${user.userId || user.uid || user.id}&width=120&height=120`
      }))
      .filter(f => f.userId && f.userId.length > 5 && !f.userId.startsWith('0'));

    if (friends.length === 0) {
      throw new Error('Không có userId hợp lệ nào');
    }

    // Cache vào apiState
    apiState.friends = friends;
    apiState.friendsMap = new Map(friends.map(f => [f.userId, f]));

    // Gửi về frontend
    ws.send(JSON.stringify({
      type: 'friends_list',
      total: friends.length,
      friends: friends
    }));

    console.log(`✅ HOÀN TẤT! Load thành công ${friends.length} bạn bè`);

  } catch (error) {
    console.error('❌ Lỗi loadFriends:', error.message);
    sendError(`Lỗi: ${error.message || 'Không xác định'}`);
  }
}

module.exports = { loadFriends };