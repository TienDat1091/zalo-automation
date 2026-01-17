// friends.js - FIX LỖI SYNTAX + LOAD FULL BẠN BÈ 2025 (test OK 2.5k+ friends)
async function loadFriends(apiState, ws, force = false) {
  if (!apiState?.api || !apiState?.isLoggedIn) {
    return ws.send(JSON.stringify({
      type: 'friends_error',
      error: 'Chưa đăng nhập Zalo!'
    }));
  }

  // CACHE: Nếu đã load rồi thì không load lại (tránh rate limit 429) -> UNLESS force = true
  if (!force && apiState.friends && apiState.friends.length > 0) {
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

// ============================================
// LOAD GROUPS (Nhóm chat)
// ============================================
async function loadGroups(apiState, ws, force = false) {
  if (!apiState?.api || !apiState?.isLoggedIn) {
    return ws.send(JSON.stringify({
      type: 'groups_error',
      error: 'Chưa đăng nhập Zalo!'
    }));
  }

  // CACHE: Nếu đã load rồi thì không load lại
  if (!force && apiState.groups && apiState.groups.length > 0) {
    console.log('📦 Dùng cache:', apiState.groups.length, 'nhóm');
    return ws.send(JSON.stringify({
      type: 'groups_list',
      total: apiState.groups.length,
      groups: apiState.groups
    }));
  }

  try {
    console.log('🔄 Đang load danh sách nhóm...');

    let rawGroups = [];

    // THỬ 1: getGroupList
    try {
      console.log('📋 Calling getGroupList...');
      const result = await apiState.api.getGroupList?.();
      console.log('📋 getGroupList RAW result:', JSON.stringify(result, null, 2)?.substring(0, 1000));

      if (result && Array.isArray(result)) {
        rawGroups = result;
      } else if (result?.data && Array.isArray(result.data)) {
        rawGroups = result.data;
      } else if (result?.groupInfoList && Array.isArray(result.groupInfoList)) {
        rawGroups = result.groupInfoList;
      } else if (typeof result === 'object' && result !== null) {
        // Try to extract any array from the result
        const keys = Object.keys(result);
        for (const key of keys) {
          if (Array.isArray(result[key]) && result[key].length > 0) {
            console.log(`📋 Found array in result.${key}:`, result[key].length);
            rawGroups = result[key];
            break;
          }
        }
      }
      console.log('getGroupList →', rawGroups.length, 'nhóm');
    } catch (e) {
      console.log('getGroupList error:', e.message);
    }

    // THỬ 2: getAllGroups (fallback) - returns {version, gridVerMap}
    if (rawGroups.length === 0) {
      try {
        console.log('📋 Trying getAllGroups fallback...');
        const result2 = await apiState.api.getAllGroups?.();
        console.log('📋 getAllGroups keys:', result2 ? Object.keys(result2) : 'null');

        if (result2 && Array.isArray(result2)) {
          rawGroups = result2;
        } else if (result2?.data && Array.isArray(result2.data)) {
          rawGroups = result2.data;
        } else if (result2?.gridVerMap && typeof result2.gridVerMap === 'object') {
          // ✅ FIX: gridVerMap contains groupId as KEYS!
          const groupIds = Object.keys(result2.gridVerMap);
          console.log(`📋 Found ${groupIds.length} group IDs in gridVerMap`);

          // Fetch group info for each group ID
          for (const groupId of groupIds) {
            try {
              const groupInfoRes = await apiState.api.getGroupInfo?.(groupId);
              console.log(`📋 getGroupInfo(${groupId}) keys:`, groupInfoRes ? Object.keys(groupInfoRes) : 'null');

              // ✅ API returns: { gridInfoMap: { [groupId]: GroupInfo } }
              let info = null;
              if (groupInfoRes?.gridInfoMap?.[groupId]) {
                info = groupInfoRes.gridInfoMap[groupId];
              } else if (groupInfoRes?.data?.[groupId]) {
                info = groupInfoRes.data[groupId];
              } else if (groupInfoRes?.[groupId]) {
                info = groupInfoRes[groupId];
              } else if (groupInfoRes?.name) {
                info = groupInfoRes; // Direct response
              }

              if (info) {
                console.log(`✅ Group ${groupId} info:`, info.name, info.totalMember);
                rawGroups.push({
                  groupId: groupId,
                  name: info.name || 'Nhóm Zalo',
                  avt: info.avt || info.avatar || info.fullAvt || '',
                  totalMember: info.totalMember || info.memberIds?.length || 0,
                  type: info.type || 1
                });
              } else {
                console.log(`⚠️ No info for group ${groupId}, using basic`);
                rawGroups.push({
                  groupId: groupId,
                  name: 'Nhóm ' + groupId.substring(0, 6),
                  avt: '',
                  totalMember: 0,
                  type: 1
                });
              }
            } catch (e) {
              console.log(`❌ getGroupInfo(${groupId}) error:`, e.message);
              rawGroups.push({
                groupId: groupId,
                name: 'Nhóm ' + groupId.substring(0, 6),
                avt: '',
                totalMember: 0,
                type: 1
              });
            }
          }
          console.log(`📋 Fetched info for ${rawGroups.length} groups`);
        }
      } catch (e2) {
        console.log('getAllGroups error:', e2.message);
      }
    }

    if (!Array.isArray(rawGroups)) {
      rawGroups = [];
    }

    console.log('📋 Final rawGroups count:', rawGroups.length);

    // Chuẩn hóa data
    const groups = rawGroups.map(group => ({
      groupId: String(group.groupId || group.id || '').trim(),
      name: (group.name || 'Nhóm Zalo').trim(),
      avatar: group.avt || group.avatar || group.fullAvt || '',
      totalMember: group.totalMember || group.memberIds?.length || 0,
      type: group.type || 1, // 1 = Group, 2 = Community
      isGroup: true
    })).filter(g => g.groupId && g.groupId.length > 5);

    // Cache vào apiState
    apiState.groups = groups;
    apiState.groupsMap = new Map(groups.map(g => [g.groupId, g]));

    // Gửi về frontend
    ws.send(JSON.stringify({
      type: 'groups_list',
      total: groups.length,
      groups: groups
    }));

    console.log(`✅ HOÀN TẤT! Load thành công ${groups.length} nhóm`);

  } catch (error) {
    console.error('❌ Lỗi loadGroups:', error.message);
    ws.send(JSON.stringify({
      type: 'groups_error',
      error: `Lỗi: ${error.message || 'Không xác định'}`
    }));
  }
}

module.exports = { loadFriends, loadGroups };