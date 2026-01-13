function isDBReady() {
  return dbInstance && !dbInstance.closed;
}

async function initIndexedDB(userUID) {
  return new Promise((resolve, reject) => {
    const dbName = `ZaloChat_${userUID}`;
    const request = indexedDB.open(dbName, 3);

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
      dbInstance = request.result;
      currentUserUID = userUID;
      localStorage.setItem('currentUserUID', userUID);
      console.log(`✅ IndexedDB initialized for user: ${userUID}`);

      loadAllMessagesFromDB();
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      for (let i = db.objectStoreNames.length - 1; i >= 0; i--) {
        db.deleteObjectStore(db.objectStoreNames[i]);
      }

      const store = db.createObjectStore('messages', {
        keyPath: 'id',
        autoIncrement: true
      });
      store.createIndex('uid', 'uid', { unique: false });
      store.createIndex('msgId', 'msgId', { unique: false });
      store.createIndex('timestamp', 'timestamp', { unique: false });
    };
  });
}

async function loadAllMessagesFromDB() {
  if (!isDBReady()) return;

  try {
    const transaction = dbInstance.transaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const allRequest = store.getAll();

    allRequest.onsuccess = () => {
      const messages = allRequest.result;
      console.log(`📊 Loading ${messages.length} messages from DB`);

      allMessages.clear();
      messageStore.clear();

      for (const msg of messages) {
        const uid = msg.uid;
        if (!allMessages.has(uid)) {
          allMessages.set(uid, []);
        }

        // ✅ Giữ TOÀN BỘ message object (bao gồm imageUrl, type, fileData, etc.)
        allMessages.get(uid).push({
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
          stickerData: msg.stickerData
        });

        // ✅ Build messageStore for last message tracking
        const timestamp = msg.timestamp || msg.savedAt || 0;
        const content = msg.content || msg.msg || '';
        const existing = messageStore.get(uid);
        if (!existing || timestamp > existing.timestamp) {
          messageStore.set(uid, {
            lastMessage: content,
            timestamp: timestamp
          });
        }
      }

      console.log(`✅ Loaded ${allMessages.size} unique chats`);
      console.log(`✅ MessageStore: ${messageStore.size} chats with timestamps`);

      // ✅ Sort by timestamp on load
      sortFriendsAfterLoad();
    };
  } catch (err) {
    console.error('❌ Error loading messages:', err);
  }
}

async function autoSaveToIndexedDB(uid, message) {
  if (!isDBReady()) return;

  try {
    const transaction = dbInstance.transaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');

    const msgId = message.msgId || message.id || `${uid}-${message.timestamp}-${Math.random()}`;

    try {
      const msgIdIndex = store.index('msgId');
      const existingRequest = msgIdIndex.get(msgId);

      existingRequest.onsuccess = () => {
        if (!existingRequest.result) {
          const data = {
            uid,
            msgId: msgId,
            ...message,
            savedAt: Date.now()
          };
          store.add(data);
        }
      };
    } catch (e) {
      const data = {
        uid,
        msgId: msgId,
        ...message,
        savedAt: Date.now()
      };
      store.add(data);
    }
  } catch (err) {
    console.error('❌ Save error:', err);
  }
}

function openStorageInfo() {
  if (!currentUserUID) {
    alert('❌ User not logged in');
    return;
  }
  window.open(`/storage-info.html?userUID=${currentUserUID}`, 'storage-info', 'width=1000,height=1200');
}

function openAutoReplyViewer() {
  if (!currentUserUID) {
    alert('❌ User not logged in');
    return;
  }

  const url = `trigger-manager.html?userUID=${currentUserUID}&dbName=ZaloChat_${currentUserUID}`;
  window.open(url, '_blank');
}


