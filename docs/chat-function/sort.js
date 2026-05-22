// ✅ SORT FRIENDS ALPHABETICALLY AND LOAD RECENT CHATS AFTER INITIAL LOAD
function sortFriendsAfterLoad() {
    console.log(`🔄 Sorting friends alphabetically (A-Z) and refreshing chats...`);
    
    // Sort friends array (Contacts list) A-Z using Vietnamese locale rules
    if (typeof friends !== 'undefined' && friends && friends.length > 0) {
      friends.sort((a, b) => {
        const nameA = (a.displayName || a.zaloName || '').toLowerCase();
        const nameB = (b.displayName || b.zaloName || '').toLowerCase();
        return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
      });
      filteredFriends = [...friends];
    }
    
    // Render/refresh both Chats and Contacts
    if (typeof refreshSidebarLists === 'function') {
      refreshSidebarLists();
    }
    
    // ✅ Auto-select last chat from localStorage
    const lastChat = localStorage.getItem('lastChatWith');
    if (lastChat) {
      try {
        const { userId, displayName, avatar, isGroup } = JSON.parse(lastChat);
        
        // Find if this is a group or friend to select it properly
        if (isGroup) {
          if (typeof selectGroup === 'function') {
            console.log(`📂 Auto-selecting last group chat: ${displayName}`);
            setTimeout(() => {
              selectGroup(userId, displayName, avatar);
            }, 300);
          }
        } else {
          // It could be a stranger or a friend
          if (typeof selectFriend === 'function') {
            console.log(`📂 Auto-selecting last private chat: ${displayName}`);
            setTimeout(() => {
              selectFriend(userId, displayName, avatar);
            }, 300);
          }
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse lastChatWith', e);
      }
    }
}
window.sortFriendsAfterLoad = sortFriendsAfterLoad;