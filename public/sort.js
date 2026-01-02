// ✅ SORT FRIENDS BY LAST MESSAGE TIMESTAMP AFTER LOAD
function sortFriendsAfterLoad() {
    console.log(`🔄 Sorting friends by last message timestamp`);
    
    filteredFriends.sort((a, b) => {
      const aTime = messageStore.get(a.userId)?.timestamp || 0;
      const bTime = messageStore.get(b.userId)?.timestamp || 0;
      return bTime - aTime; // Newest first
    });
    console.log(`✅ Friends sorted. Top: ${filteredFriends[0]?.displayName}`);
    renderFriendsVirtual();
    
    // ✅ Auto-select last chat
    const lastChat = localStorage.getItem('lastChatWith');
    if (lastChat) {
      try {
        const { userId } = JSON.parse(lastChat);
        const lastFriend = filteredFriends.find(f => f.userId === userId);
        if (lastFriend) {
          console.log(`📂 Auto-selecting last chat: ${lastFriend.displayName}`);
          setTimeout(() => {
            selectFriend(lastFriend.userId, lastFriend.displayName, lastFriend.avatar);
          }, 300);
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse lastChatWith');
      }
    }
  }