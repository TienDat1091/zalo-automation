// ✅ Global variables initialization (using window object to prevent re-declaration errors)
if (!window.dbInstance) window.dbInstance = null;
if (!window.currentUserUID) window.currentUserUID = null;
if (!window.allMessages) window.allMessages = new Map(); // Map of uid -> [messages]
if (!window.messageStore) window.messageStore = new Map(); // Map of uid -> {lastMessage, timestamp}

function isDBReady() {
  return window.dbInstance && !window.dbInstance.closed;
}

// ✅ Get unique device ID
function getDeviceId() {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
}

// ✅ Get device name for display
function getDeviceName() {
  const userAgent = navigator.userAgent;
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Mac/.test(userAgent)) return 'Mac';
  if (/Linux/.test(userAgent)) return 'Linux';
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
  if (/Android/.test(userAgent)) return 'Android';
  return 'Unknown Device';
}

async function initIndexedDB(userUID) {
  return new Promise((resolve, reject) => {
    const dbName = `ZaloChat_${userUID}`;
    const request = indexedDB.open(dbName, 2); // Version 2 - messages only

    request.onerror = () => {
      if (request.error.name === 'VersionError') {
        indexedDB.deleteDatabase(dbName);
        setTimeout(() => {
          initIndexedDB(userUID).then(resolve).catch(reject);
        }, 500);
      } else {
        reject(request.error);
      }
    };

    request.onsuccess = () => {
      window.dbInstance = request.result;
      window.currentUserUID = userUID;
      localStorage.setItem('currentUserUID', userUID);
      console.log(`✅ IndexedDB initialized for user: ${userUID}`);

      loadAllMessagesFromDB();
      resolve(window.dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      for (let i = db.objectStoreNames.length - 1; i >= 0; i--) {
        db.deleteObjectStore(db.objectStoreNames[i]);
      }

      // Messages store
      const messagesStore = db.createObjectStore('messages', {
        keyPath: 'id',
        autoIncrement: true
      });
      messagesStore.createIndex('uid', 'uid', { unique: false });
      messagesStore.createIndex('msgId', 'msgId', { unique: false });
      messagesStore.createIndex('timestamp', 'timestamp', { unique: false });

      console.log('✅ Created IndexedDB store: messages (only)');
    };
  });
}

async function loadAllMessagesFromDB() {
  if (!isDBReady()) return;

  try {
    const transaction = window.dbInstance.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const allRequest = store.getAll();

    allRequest.onsuccess = () => {
      const messages = allRequest.result;
      console.log(`📊 Loading ${messages.length} messages from DB`);

      window.allMessages.clear();
      window.messageStore.clear();

      for (const msg of messages) {
        const uid = msg.uid;
        if (!window.allMessages.has(uid)) {
          window.allMessages.set(uid, []);
        }

        // ✅ Giữ TOÀN BỘ message object (bao gồm imageUrl, type, fileData, etc.)
        // ✅ Also preserve device tracking fields
        window.allMessages.get(uid).push({
          msgId: msg.msgId,
          content: msg.content || msg.msg || '',
          timestamp: msg.timestamp || msg.savedAt || 0,
          senderId: msg.senderId,
          senderName: msg.senderName || 'Unknown',
          isSelf: msg.isSelf,
          isAutoReply: msg.isAutoReply,
          type: msg.type || 'text',
          imageUrl: msg.imageUrl,
          imageData: msg.imageData,
          fileData: msg.fileData,
          gifData: msg.gifData,
          stickerData: msg.stickerData,
          // ✅ Device tracking fields
          deviceId: msg.deviceId,
          deviceName: msg.deviceName,
          hasFileDataLocally: msg.hasFileDataLocally,
          fileDataDeviceId: msg.fileDataDeviceId,
          fileDataDeviceName: msg.fileDataDeviceName
        });

        // ✅ Build messageStore for last message tracking
        const timestamp = msg.timestamp || msg.savedAt || 0;
        const content = msg.content || msg.msg || '';
        const existing = window.messageStore.get(uid);
        if (!existing || timestamp > existing.timestamp) {
          window.messageStore.set(uid, {
            lastMessage: content,
            timestamp: timestamp
          });
        }
      }

      console.log(`✅ Loaded ${window.allMessages.size} unique chats`);
      console.log(`✅ MessageStore: ${window.messageStore.size} chats with timestamps`);

      // ✅ Sort by timestamp on load
      // sortFriendsAfterLoad(); // Function not defined, skipping
    };
  } catch (err) {
    console.error('❌ Error loading messages:', err);
  }
}

async function autoSaveToIndexedDB(uid, message) {
  if (!isDBReady()) return;

  try {
    const transaction = window.dbInstance.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');

    const msgId = message.msgId || message.id || `${uid}-${message.timestamp}-${Math.random()}`;

    try {
      const msgIdIndex = store.index('msgId');
      const existingRequest = msgIdIndex.get(msgId);

      existingRequest.onsuccess = () => {
        if (!existingRequest.result) {
          const deviceId = getDeviceId();
          const deviceName = getDeviceName();
          
          // ✅ Mark if file data exists locally on this device
          const hasFileData = !!(message.fileData?.fileUrl || message.imageData || message.gifData);
          
          const data = {
            uid,
            msgId: msgId,
            ...message,
            savedAt: Date.now(),
            // ✅ Device tracking
            deviceId: deviceId,
            deviceName: deviceName,
            hasFileDataLocally: hasFileData,
            fileDataDeviceId: hasFileData ? deviceId : undefined,
            fileDataDeviceName: hasFileData ? deviceName : undefined
          };
          store.add(data);
          console.log(`💾 Saved message to device: ${deviceName} (${deviceId}), has file data: ${hasFileData}`);
        }
      };
    } catch (e) {
      const deviceId = getDeviceId();
      const deviceName = getDeviceName();
      const hasFileData = !!(message.fileData?.fileUrl || message.imageData || message.gifData);
      
      const data = {
        uid,
        msgId: msgId,
        ...message,
        savedAt: Date.now(),
        // ✅ Device tracking
        deviceId: deviceId,
        deviceName: deviceName,
        hasFileDataLocally: hasFileData,
        fileDataDeviceId: hasFileData ? deviceId : undefined,
        fileDataDeviceName: hasFileData ? deviceName : undefined
      };
      store.add(data);
      console.log(`💾 Saved message to device: ${deviceName} (${deviceId}), has file data: ${hasFileData}`);
    }
  } catch (err) {
    console.error('❌ Save error:', err);
  }
}

function openStorageInfo() {
  if (!window.currentUserUID) {
    alert('❌ User not logged in');
    return;
  }
  window.open(`/storage-info.html?userUID=${window.currentUserUID}`, 'storage-info', 'width=1000,height=1200');
}

function openAutoReplyViewer() {
  if (!window.currentUserUID) {
    alert('❌ User not logged in');
    return;
  }

  const url = `trigger-manager.html?userUID=${window.currentUserUID}&dbName=ZaloChat_${window.currentUserUID}`;
  window.open(url, '_blank');
}

// ===============================================
// BACKUP & EXPORT FUNCTIONS
// ===============================================

async function exportAllDataAsJSON() {
  if (!isDBReady()) {
    alert('❌ Database not ready');
    return;
  }

  try {
    console.log('📦 Exporting all data...');

    // Get all messages
    const messagesTransaction = dbInstance.transaction(['messages'], 'readonly');
    const messagesStore = messagesTransaction.objectStore('messages');
    const messagesRequest = messagesStore.getAll();

    const messages = await new Promise((resolve, reject) => {
      messagesRequest.onsuccess = () => resolve(messagesRequest.result);
      messagesRequest.onerror = () => reject(messagesRequest.error);
    });

    // Count unique conversations
    const uniqueUids = new Set();
    messages.forEach(m => { if (m.uid) uniqueUids.add(m.uid); });

    // Create backup object
    const backup = {
      version: 1,
      timestamp: new Date().toISOString(),
      userUID: window.currentUserUID,
      dbName: `ZaloChat_${window.currentUserUID}`,
      data: {
        messages: messages,
        friends: [] // Empty as we no longer store friends separately
      },
      stats: {
        totalMessages: messages.length,
        totalFriends: uniqueUids.size
      }
    };

    // Convert to JSON and download
    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `zalo-backup-${window.currentUserUID}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`✅ Exported ${backup.stats.totalMessages} messages`);
    alert(`✅ Backup successfully exported!\n\nMessages: ${backup.stats.totalMessages}\nConversations: ${backup.stats.totalFriends}`);

    return backup;
  } catch (err) {
    console.error('❌ Export failed:', err);
    alert('❌ Export failed: ' + err.message);
  }
}

async function importDataFromJSON(file) {
  if (!isDBReady()) {
    alert('❌ Database not ready');
    return;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target.result);

        // Validate backup structure (friends is optional now)
        if (!backup.version || !backup.data || !backup.data.messages) {
          throw new Error('Invalid backup file format');
        }

        console.log('📥 Importing backup...');
        console.log(`User: ${backup.userUID}`);
        console.log(`Messages: ${backup.data.messages.length}`);

        // Confirm with user
        const confirmMsg = `Import backup?\n\nUser: ${backup.userUID}\nMessages: ${backup.data.messages.length}\nDate: ${new Date(backup.timestamp).toLocaleString()}\n\n⚠️ This will REPLACE all existing data!`;

        if (!confirm(confirmMsg)) {
          console.log('❌ Import cancelled by user');
          reject(new Error('Import cancelled'));
          return;
        }

        // Clear existing data
        await clearAllIndexedDBData();

        // Import messages
        const messagesTransaction = window.dbInstance.transaction(['messages'], 'readwrite');
        const messagesStore = messagesTransaction.objectStore('messages');

        for (const message of backup.data.messages) {
          messagesStore.add(message);
        }

        await new Promise((resolve, reject) => {
          messagesTransaction.oncomplete = resolve;
          messagesTransaction.onerror = () => reject(messagesTransaction.error);
        });

        console.log('✅ Import complete!');
        alert(`✅ Import successful!\n\nMessages: ${backup.data.messages.length}\n\nPlease reload the page.`);

        resolve(backup);
      } catch (err) {
        console.error('❌ Import failed:', err);
        alert('❌ Import failed: ' + err.message);
        reject(err);
      }
    };

    reader.onerror = () => {
      console.error('❌ File read error');
      alert('❌ Failed to read file');
      reject(reader.error);
    };

    reader.readAsText(file);
  });
}

async function getDataStats() {
  if (!isDBReady()) {
    return { messages: 0, friends: 0, dbSize: 'N/A' };
  }

  try {
    // Count messages
    let messagesCount = 0;
    try {
      const messagesTransaction = window.dbInstance.transaction(['messages'], 'readonly');
      const messagesStore = messagesTransaction.objectStore('messages');
      messagesCount = await new Promise((resolve) => {
        const request = messagesStore.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    } catch (e) {
      console.log('⚠️ Could not count messages:', e.message);
    }

    // Count unique conversations (as proxy for "friends")
    let friendsCount = 0;
    try {
      const tx = window.dbInstance.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const allRequest = store.getAll();

      const uniqueUids = await new Promise((resolve) => {
        allRequest.onsuccess = () => {
          const msgs = allRequest.result || [];
          const uids = new Set();
          msgs.forEach(m => { if (m.uid) uids.add(m.uid); });
          resolve(uids.size);
        };
        allRequest.onerror = () => resolve(0);
      });
      friendsCount = uniqueUids;
    } catch (e) {
      console.log('⚠️ Could not count friends:', e.message);
    }

    // Estimate size
    let dbSize = 'N/A';
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        dbSize = estimate ? `${(estimate.usage / 1024 / 1024).toFixed(2)} MB` : 'N/A';
      }
    } catch (e) {
      console.log('⚠️ Could not estimate storage:', e.message);
    }

    return {
      messages: messagesCount,
      friends: friendsCount,
      dbSize: dbSize,
      dbName: `ZaloChat_${currentUserUID}`
    };
  } catch (err) {
    console.error('Error getting stats:', err);
    return { messages: 0, friends: 0, dbSize: 'Error' };
  }
}

