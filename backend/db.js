const fs = require('fs/promises');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');
let admin;
let firestoreDb = null;

// Initialize Firebase if secret file exists or env variable is set
try {
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Try to require local firebase-key.json
    try {
      serviceAccount = require('./firebase-key.json');
    } catch (e) {
      // Local key not found
    }
  }

  if (serviceAccount) {
    admin = require('firebase-admin');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firestoreDb = admin.firestore();
    console.log('Firebase Firestore DB connector initialized successfully.');
  } else {
    console.log('Firebase service account key not found. Using local JSON database.');
  }
} catch (err) {
  console.error('Firebase DB connector initialization failed. Falling back to local JSON database:', err.message);
}

// Helper to read local database (fallback)
async function readDb() {
  let content = '';
  try {
    content = await fs.readFile(DB_FILE, 'utf-8');
  } catch (error) {
    return {
      users: [],
      messages: [],
      groups: [],
      group_members: [],
      verification_requests: [],
      friendships: [],
      blocked_users: []
    };
  }

  const data = JSON.parse(content);
  let dbUpdated = false;
  const now = new Date();
  
  data.users.forEach(u => {
    if (u.verified_until && new Date(u.verified_until) < now) {
      u.verified_until = null;
      u.is_verified = 0;
      dbUpdated = true;
    }
  });

  if (!data.verification_requests) {
    data.verification_requests = [];
    dbUpdated = true;
  }
  
  if (!data.friendships) {
    data.friendships = [];
    dbUpdated = true;
  }
  
  if (!data.blocked_users) {
    data.blocked_users = [];
    dbUpdated = true;
  }

  if (dbUpdated) {
    writeDb(data).catch(console.error);
  }

  return data;
}

// Helper to write local database (fallback)
async function writeDb(data) {
  const tempPath = DB_FILE + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, DB_FILE);
}

async function initDb() {
  if (firestoreDb) {
    // Create counters if not exists
    const usersCounter = await firestoreDb.collection('counters').doc('users').get();
    if (!usersCounter.exists) {
      await firestoreDb.collection('counters').doc('users').set({ currentId: 0 });
    }
    const groupsCounter = await firestoreDb.collection('counters').doc('groups').get();
    if (!groupsCounter.exists) {
      await firestoreDb.collection('counters').doc('groups').set({ currentId: 0 });
    }
    const messagesCounter = await firestoreDb.collection('counters').doc('messages').get();
    if (!messagesCounter.exists) {
      await firestoreDb.collection('counters').doc('messages').set({ currentId: 0 });
    }
    const friendshipsCounter = await firestoreDb.collection('counters').doc('friendships').get();
    if (!friendshipsCounter.exists) {
      await firestoreDb.collection('counters').doc('friendships').set({ currentId: 0 });
    }
    console.log('Firestore collections initialized.');
    return;
  }

  try {
    await fs.access(DB_FILE);
    console.log('Database file found.');
  } catch {
    console.log('Database file not found, creating a new one...');
    await writeDb({
      users: [],
      messages: [],
      groups: [],
      group_members: [],
      verification_requests: [],
      friendships: [],
      blocked_users: []
    });
  }
}

// Helper for Firestore Autoincrement IDs
async function getNextId(counterName) {
  const counterRef = firestoreDb.collection('counters').doc(counterName);
  return firestoreDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(counterRef);
    if (!doc.exists) {
      transaction.set(counterRef, { currentId: 1 });
      return 1;
    }
    const newId = doc.data().currentId + 1;
    transaction.update(counterRef, { currentId: newId });
    return newId;
  });
}

// --- USER OPERATIONS ---

async function getUserById(id) {
  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('users').where('id', '==', Number(id)).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  }
  const db = await readDb();
  return db.users.find(u => u.id === Number(id)) || null;
}

async function getUserByUsername(username) {
  const cleanUsername = username.trim().toLowerCase();
  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('users').where('username', '==', cleanUsername).limit(1).get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data();
  }
  const db = await readDb();
  return db.users.find(u => u.username === cleanUsername) || null;
}

async function createUser(username, password_hash, display_name, avatar_url) {
  const cleanUsername = username.trim().toLowerCase();
  if (firestoreDb) {
    const newId = await getNextId('users');
    const newUser = {
      id: newId,
      username: cleanUsername,
      password_hash,
      display_name: display_name.trim(),
      avatar_url,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      is_verified: cleanUsername === 'zihanfakir' ? 1 : 0,
      verified_until: null,
      is_admin: cleanUsername === 'zihanfakir' ? 1 : 0,
      is_banned: 0,
      pinned_chats: []
    };
    await firestoreDb.collection('users').doc(String(newId)).set(newUser);
    return newUser;
  }

  const db = await readDb();
  const newUser = {
    id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
    username: cleanUsername,
    password_hash,
    display_name: display_name.trim(),
    avatar_url,
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    is_verified: cleanUsername === 'zihanfakir' ? 1 : 0,
    verified_until: null,
    is_admin: cleanUsername === 'zihanfakir' ? 1 : 0,
    is_banned: 0,
    pinned_chats: []
  };

  db.users.push(newUser);
  await writeDb(db);
  return newUser;
}

async function searchUsers(query, excludeUserId) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery === '') return [];

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('users').limit(100).get();
    const users = [];
    snapshot.forEach(doc => {
      const u = doc.data();
      if (u.id !== Number(excludeUserId) && !u.is_banned) {
        if (u.username.includes(cleanQuery) || u.display_name.toLowerCase().includes(cleanQuery)) {
          users.push({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            is_verified: u.is_verified || 0,
            is_admin: u.is_admin || 0
          });
        }
      }
    });
    return users.slice(0, 10);
  }

  const db = await readDb();
  return db.users
    .filter(u => u.id !== Number(excludeUserId) && !u.is_banned && (u.username.includes(cleanQuery) || u.display_name.toLowerCase().includes(cleanQuery)))
    .map(u => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      is_verified: u.is_verified,
      is_admin: u.is_admin
    }))
    .slice(0, 10);
}

async function updateUserProfile(userId, updates) {
  if (firestoreDb) {
    const userRef = firestoreDb.collection('users').doc(String(userId));
    await userRef.update(updates);
    const doc = await userRef.get();
    return doc.data();
  }

  const db = await readDb();
  const uId = Number(userId);
  let updatedUser = null;
  
  db.users = db.users.map(u => {
    if (u.id === uId) {
      updatedUser = { ...u, ...updates };
      return updatedUser;
    }
    return u;
  });

  if (updatedUser) {
    await writeDb(db);
  }
  return updatedUser;
}

async function changeUserPassword(userId, passwordHash) {
  if (firestoreDb) {
    const userRef = firestoreDb.collection('users').doc(String(userId));
    await userRef.update({ password_hash: passwordHash });
    return { success: true };
  }

  const db = await readDb();
  const uId = Number(userId);
  const user = db.users.find(u => u.id === uId);
  if (!user) return { success: false, error: 'User not found' };
  
  user.password_hash = passwordHash;
  await writeDb(db);
  return { success: true };
}

// --- GROUP OPERATIONS ---

async function getGroupById(groupId) {
  if (firestoreDb) {
    const doc = await firestoreDb.collection('groups').doc(String(groupId)).get();
    return doc.exists ? doc.data() : null;
  }
  const db = await readDb();
  return db.groups.find(g => g.id === Number(groupId)) || null;
}

async function createGroup(name, creatorId, memberIds = []) {
  if (firestoreDb) {
    const newGroupId = await getNextId('groups');
    const newGroup = {
      id: newGroupId,
      name: name.trim(),
      created_by: Number(creatorId),
      created_at: new Date().toISOString()
    };
    await firestoreDb.collection('groups').doc(String(newGroupId)).set(newGroup);

    const batch = firestoreDb.batch();
    const uniqueMembers = Array.from(new Set([Number(creatorId), ...memberIds.map(Number)]));
    uniqueMembers.forEach(mId => {
      const memberDocRef = firestoreDb.collection('group_members').doc(`${newGroupId}_${mId}`);
      batch.set(memberDocRef, {
        group_id: newGroupId,
        user_id: mId,
        joined_at: new Date().toISOString()
      });
    });
    await batch.commit();
    return newGroup;
  }

  const db = await readDb();
  const newGroupId = db.groups.length > 0 ? Math.max(...db.groups.map(g => g.id)) + 1 : 1;

  const newGroup = {
    id: newGroupId,
    name: name.trim(),
    created_by: Number(creatorId),
    created_at: new Date().toISOString()
  };

  db.groups.push(newGroup);

  const uniqueMembers = Array.from(new Set([Number(creatorId), ...memberIds.map(Number)]));
  uniqueMembers.forEach(mId => {
    db.group_members.push({
      group_id: newGroupId,
      user_id: mId,
      joined_at: new Date().toISOString()
    });
  });

  await writeDb(db);
  return newGroup;
}

async function addGroupMember(groupId, userId) {
  const gId = Number(groupId);
  const uId = Number(userId);

  if (firestoreDb) {
    const memberDocRef = firestoreDb.collection('group_members').doc(`${gId}_${uId}`);
    await memberDocRef.set({
      group_id: gId,
      user_id: uId,
      joined_at: new Date().toISOString()
    });
    return { success: true };
  }

  const db = await readDb();
  const exists = db.group_members.some(gm => gm.group_id === gId && gm.user_id === uId);
  if (exists) return { error: 'User is already a member' };

  db.group_members.push({
    group_id: gId,
    user_id: uId,
    joined_at: new Date().toISOString()
  });

  await writeDb(db);
  return { success: true };
}

async function isGroupMember(groupId, userId) {
  const gId = Number(groupId);
  const uId = Number(userId);

  if (firestoreDb) {
    const doc = await firestoreDb.collection('group_members').doc(`${gId}_${uId}`).get();
    return doc.exists;
  }

  const db = await readDb();
  return db.group_members.some(gm => gm.group_id === gId && gm.user_id === uId);
}

async function getGroupMembers(groupId) {
  const gId = Number(groupId);

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('group_members').where('group_id', '==', gId).get();
    const members = [];
    for (const doc of snapshot.docs) {
      const uId = doc.data().user_id;
      const user = await getUserById(uId);
      if (user) members.push(user);
    }
    return members;
  }

  const db = await readDb();
  const memberIds = db.group_members.filter(gm => gm.group_id === gId).map(gm => gm.user_id);
  return db.users.filter(u => memberIds.includes(u.id));
}

async function updateGroupSettings(groupId, name) {
  const gId = Number(groupId);

  if (firestoreDb) {
    await firestoreDb.collection('groups').doc(String(gId)).update({ name: name.trim() });
    return { success: true };
  }

  const db = await readDb();
  const group = db.groups.find(g => g.id === gId);
  if (!group) return { error: 'Group not found' };

  group.name = name.trim();
  await writeDb(db);
  return { success: true };
}

async function setGroupAdmin(groupId, userId, isAdmin) {
  // Not used in our main app, but stubbing for API consistency
  return { success: true };
}

async function getUserGroups(userId) {
  const uId = Number(userId);

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('group_members').where('user_id', '==', uId).get();
    const groups = [];
    for (const doc of snapshot.docs) {
      const gId = doc.data().group_id;
      const group = await getGroupById(gId);
      if (group) groups.push(group);
    }
    return groups;
  }

  const db = await readDb();
  const groupIds = db.group_members.filter(gm => gm.user_id === uId).map(gm => gm.group_id);
  return db.groups.filter(g => groupIds.includes(g.id));
}

// --- MESSAGE OPERATIONS ---

async function saveMessage(chatType, senderId, receiverId, groupId, content, replyToId) {
  if (firestoreDb) {
    const newMsgId = await getNextId('messages');
    const newMessage = {
      id: newMsgId,
      chat_type: chatType,
      sender_id: Number(senderId),
      receiver_id: receiverId ? Number(receiverId) : null,
      group_id: groupId ? Number(groupId) : null,
      content: content.trim(),
      reply_to_id: replyToId ? Number(replyToId) : null,
      created_at: new Date().toISOString(),
      status: 'sent',
      reactions: {}
    };
    await firestoreDb.collection('messages').doc(String(newMsgId)).set(newMessage);
    return newMessage;
  }

  const db = await readDb();
  const newMessage = {
    id: db.messages.length > 0 ? Math.max(...db.messages.map(m => m.id)) + 1 : 1,
    chat_type: chatType,
    sender_id: Number(senderId),
    receiver_id: receiverId ? Number(receiverId) : null,
    group_id: groupId ? Number(groupId) : null,
    content: content.trim(),
    reply_to_id: replyToId ? Number(replyToId) : null,
    created_at: new Date().toISOString(),
    status: 'sent',
    reactions: {}
  };

  db.messages.push(newMessage);
  await writeDb(db);
  return newMessage;
}

async function getPrivateMessages(user1, user2) {
  const u1 = Number(user1);
  const u2 = Number(user2);

  if (firestoreDb) {
    const snapshot1 = await firestoreDb.collection('messages')
      .where('chat_type', '==', 'private')
      .where('sender_id', '==', u1)
      .where('receiver_id', '==', u2)
      .get();
    const snapshot2 = await firestoreDb.collection('messages')
      .where('chat_type', '==', 'private')
      .where('sender_id', '==', u2)
      .where('receiver_id', '==', u1)
      .get();
    
    const messages = [];
    snapshot1.forEach(doc => messages.push(doc.data()));
    snapshot2.forEach(doc => messages.push(doc.data()));
    return messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  const db = await readDb();
  return db.messages
    .filter(m => m.chat_type === 'private' && ((m.sender_id === u1 && m.receiver_id === u2) || (m.sender_id === u2 && m.receiver_id === u1)))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function getGroupMessages(groupId) {
  const gId = Number(groupId);

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('messages')
      .where('chat_type', '==', 'group')
      .where('group_id', '==', gId)
      .get();
    const messages = [];
    snapshot.forEach(doc => messages.push(doc.data()));
    return messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  const db = await readDb();
  return db.messages
    .filter(m => m.chat_type === 'group' && m.group_id === gId)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

async function markMessagesAsRead(senderId, receiverId) {
  const sId = Number(senderId);
  const rId = Number(receiverId);

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('messages')
      .where('chat_type', '==', 'private')
      .where('sender_id', '==', sId)
      .where('receiver_id', '==', rId)
      .where('status', '!=', 'read')
      .get();
    
    const batch = firestoreDb.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { status: 'read' });
    });
    await batch.commit();
    return;
  }

  const db = await readDb();
  db.messages = db.messages.map(m => {
    if (m.chat_type === 'private' && m.sender_id === sId && m.receiver_id === rId && m.status !== 'read') {
      m.status = 'read';
    }
    return m;
  });
  await writeDb(db);
}

async function markMessagesAsDelivered(userId) {
  const uId = Number(userId);

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('messages')
      .where('chat_type', '==', 'private')
      .where('receiver_id', '==', uId)
      .where('status', '==', 'sent')
      .get();
    
    const batch = firestoreDb.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { status: 'delivered' });
    });
    await batch.commit();
    return;
  }

  const db = await readDb();
  db.messages = db.messages.map(m => {
    if (m.chat_type === 'private' && m.receiver_id === uId && m.status === 'sent') {
      m.status = 'delivered';
    }
    return m;
  });
  await writeDb(db);
}

async function deleteMessage(messageId, userId) {
  const mId = Number(messageId);
  const uId = Number(userId);

  if (firestoreDb) {
    const docRef = firestoreDb.collection('messages').doc(String(mId));
    const doc = await docRef.get();
    if (!doc.exists) return { error: 'Message not found' };
    if (doc.data().sender_id !== uId) return { error: 'Unauthorized to delete this message' };
    await docRef.delete();
    return { success: true };
  }

  const db = await readDb();
  const index = db.messages.findIndex(m => m.id === mId);
  if (index === -1) return { error: 'Message not found' };
  
  if (db.messages[index].sender_id !== uId) {
    return { error: 'Unauthorized to delete this message' };
  }

  db.messages.splice(index, 1);
  await writeDb(db);
  return { success: true };
}

async function deleteChat(userId, targetId, chatType) {
  const uId = Number(userId);
  const tId = Number(targetId);

  if (firestoreDb) {
    if (chatType === 'private') {
      const snapshot1 = await firestoreDb.collection('messages')
        .where('chat_type', '==', 'private')
        .where('sender_id', '==', uId)
        .where('receiver_id', '==', tId)
        .get();
      const snapshot2 = await firestoreDb.collection('messages')
        .where('chat_type', '==', 'private')
        .where('sender_id', '==', tId)
        .where('receiver_id', '==', uId)
        .get();
      
      const batch = firestoreDb.batch();
      snapshot1.forEach(doc => batch.delete(doc.ref));
      snapshot2.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return { success: true };
    } else {
      // Leave group
      await leaveGroup(tId, uId);
      return { success: true };
    }
  }

  const db = await readDb();
  if (chatType === 'private') {
    db.messages = db.messages.filter(m => 
      !(m.chat_type === 'private' && ((m.sender_id === u1 && m.receiver_id === u2) || (m.sender_id === u2 && m.receiver_id === u1)))
    );
  } else {
    db.group_members = db.group_members.filter(gm => !(gm.group_id === tId && gm.user_id === uId));
  }
  await writeDb(db);
  return { success: true };
}

async function getChats(userId) {
  const uId = Number(userId);

  if (firestoreDb) {
    // Retrieve users
    const userSnapshot = await firestoreDb.collection('users').get();
    const allUsers = {};
    userSnapshot.forEach(doc => {
      const u = doc.data();
      allUsers[u.id] = u;
    });

    const chatsList = [];
    const relationships = await getFriendsList(uId);

    for (const friend of relationships.friends) {
      const fUser = allUsers[friend.id];
      if (!fUser) continue;

      const msgs = await getPrivateMessages(uId, friend.id);
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      const unread = msgs.filter(m => m.sender_id === friend.id && m.status !== 'read').length;

      chatsList.push({
        id: friend.id,
        name: fUser.display_name,
        avatar_url: fUser.avatar_url,
        chat_type: 'private',
        is_verified: fUser.is_verified || 0,
        is_admin: fUser.is_admin || 0,
        last_message: lastMsg,
        unread_count: unread,
        updated_at: lastMsg ? lastMsg.created_at : fUser.created_at,
        online: false
      });
    }

    const groups = await getUserGroups(uId);
    for (const g of groups) {
      const msgs = await getGroupMessages(g.id);
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      chatsList.push({
        id: g.id,
        name: g.name,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(g.name)}&background=009688&color=fff&size=128&bold=true`,
        chat_type: 'group',
        last_message: lastMsg,
        unread_count: 0,
        updated_at: lastMsg ? lastMsg.created_at : g.created_at
      });
    }

    return chatsList.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
  }

  const db = await readDb();
  const chatsList = [];
  const friendships = db.friendships.filter(f => f.status === 'accepted' && (f.user_id_1 === uId || f.user_id_2 === uId));

  friendships.forEach(f => {
    const targetId = f.user_id_1 === uId ? f.user_id_2 : f.user_id_1;
    const contactUser = db.users.find(u => u.id === targetId);
    if (contactUser) {
      const chatMsgs = db.messages.filter(m => 
        m.chat_type === 'private' && ((m.sender_id === uId && m.receiver_id === targetId) || (m.sender_id === targetId && m.receiver_id === uId))
      );
      const lastMsg = chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1] : null;
      const unreadCount = chatMsgs.filter(m => m.sender_id === targetId && m.status !== 'read').length;

      chatsList.push({
        id: contactUser.id,
        name: contactUser.display_name,
        avatar_url: contactUser.avatar_url,
        chat_type: 'private',
        is_verified: contactUser.is_verified,
        is_admin: contactUser.is_admin,
        last_message: lastMsg,
        unread_count: unreadCount,
        updated_at: lastMsg ? lastMsg.created_at : contactUser.created_at,
        online: false
      });
    }
  });

  const memberGroupIds = db.group_members.filter(gm => gm.user_id === uId).map(gm => gm.group_id);
  const userGroups = db.groups.filter(g => memberGroupIds.includes(g.id));

  userGroups.forEach(g => {
    const groupMsgs = db.messages.filter(m => m.chat_type === 'group' && m.group_id === g.id);
    const lastMsg = groupMsgs.length > 0 ? groupMsgs[groupMsgs.length - 1] : null;

    chatsList.push({
      id: g.id,
      name: g.name,
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(g.name)}&background=009688&color=fff&size=128&bold=true`,
      chat_type: 'group',
      last_message: lastMsg,
      unread_count: 0,
      updated_at: lastMsg ? lastMsg.created_at : g.created_at
    });
  });

  return chatsList.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
}

async function updateUserLastSeen(userId, timestamp) {
  const uId = Number(userId);

  if (firestoreDb) {
    await firestoreDb.collection('users').doc(String(uId)).update({ last_seen: timestamp });
    return;
  }

  const db = await readDb();
  let updated = false;

  db.users = db.users.map(u => {
    if (u.id === uId) {
      u.last_seen = timestamp;
      updated = true;
    }
    return u;
  });

  if (updated) {
    await writeDb(db);
  }
}

// --- ADMIN & VERIFICATION ---

async function createVerificationRequest(userId, durationHours) {
  const uId = Number(userId);

  if (firestoreDb) {
    const newReqId = await getNextId('friendships'); // Sharing counters for request compatibility
    const newRequest = {
      id: newReqId,
      user_id: uId,
      duration_hours: Number(durationHours),
      status: 'pending',
      created_at: new Date().toISOString()
    };
    await firestoreDb.collection('verification_requests').doc(String(newReqId)).set(newRequest);
    return newRequest;
  }

  const db = await readDb();
  const newRequest = {
    id: db.verification_requests.length > 0 ? Math.max(...db.verification_requests.map(r => r.id)) + 1 : 1,
    user_id: uId,
    duration_hours: Number(durationHours),
    status: 'pending',
    created_at: new Date().toISOString()
  };

  db.verification_requests.push(newRequest);
  await writeDb(db);
  return newRequest;
}

async function getVerificationRequests() {
  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('verification_requests').where('status', '==', 'pending').get();
    const requests = [];
    for (const doc of snapshot.docs) {
      const r = doc.data();
      const user = await getUserById(r.user_id);
      if (user) {
        requests.push({
          id: r.id,
          user_id: r.user_id,
          duration_hours: r.duration_hours,
          status: r.status,
          created_at: r.created_at,
          display_name: user.display_name,
          username: user.username,
          avatar_url: user.avatar_url
        });
      }
    }
    return requests;
  }

  const db = await readDb();
  return db.verification_requests
    .filter(r => r.status === 'pending')
    .map(r => {
      const user = db.users.find(u => u.id === r.user_id);
      return {
        ...r,
        display_name: user ? user.display_name : 'Unknown',
        username: user ? user.username : 'unknown',
        avatar_url: user ? user.avatar_url : ''
      };
    });
}

async function updateVerificationRequest(requestId, status) {
  const rId = Number(requestId);

  if (firestoreDb) {
    await firestoreDb.collection('verification_requests').doc(String(rId)).update({ status });
    return { success: true };
  }

  const db = await readDb();
  const request = db.verification_requests.find(r => r.id === rId);
  if (!request) return { error: 'Request not found' };

  request.status = status;
  await writeDb(db);
  return { success: true };
}

async function getAllUsersAdmin() {
  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('users').get();
    return snapshot.docs.map(doc => {
      const u = doc.data();
      return {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        is_admin: u.is_admin || 0,
        is_owner: (u.id === 1 || u.username === 'zihanfakir') ? 1 : 0,
        is_verified: u.is_verified || 0,
        verified_until: u.verified_until || null,
        is_banned: u.is_banned || 0,
        created_at: u.created_at
      };
    });
  }

  const db = await readDb();
  return db.users.map(u => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    is_admin: u.is_admin || (u.username === 'zihanfakir' ? 1 : 0),
    is_owner: (u.id === 1 || u.username === 'zihanfakir') ? 1 : 0,
    is_verified: u.is_verified || (u.username === 'zihanfakir' ? 1 : 0),
    verified_until: u.verified_until || null,
    is_banned: u.is_banned || 0,
    created_at: u.created_at
  }));
}

async function updateUserAdminRole(targetUserId, isAdmin) {
  const tId = Number(targetUserId);

  if (firestoreDb) {
    await firestoreDb.collection('users').doc(String(tId)).update({ is_admin: isAdmin ? 1 : 0 });
    return { success: true };
  }

  const db = await readDb();
  const user = db.users.find(u => u.id === tId);
  if (!user) return { error: 'User not found' };
  
  user.is_admin = isAdmin ? 1 : 0;
  await writeDb(db);
  return { success: true };
}

async function banUser(userId) {
  const uId = Number(userId);

  if (firestoreDb) {
    await firestoreDb.collection('users').doc(String(uId)).update({ is_banned: 1 });
    return true;
  }

  const db = await readDb();
  const user = db.users.find(u => u.id === uId);
  if (user) {
    user.is_banned = 1;
    await writeDb(db);
    return true;
  }
  return false;
}

async function unbanUser(userId) {
  const uId = Number(userId);

  if (firestoreDb) {
    await firestoreDb.collection('users').doc(String(uId)).update({ is_banned: 0 });
    return true;
  }

  const db = await readDb();
  const user = db.users.find(u => u.id === uId);
  if (user) {
    user.is_banned = 0;
    await writeDb(db);
    return true;
  }
  return false;
}

async function updateUserBlueTick(userId, grantTick, customMinutes = 0) {
  const uId = Number(userId);

  if (firestoreDb) {
    const updateData = {};
    if (grantTick) {
      updateData.is_verified = 1;
      const untilDate = new Date();
      untilDate.setMinutes(untilDate.getMinutes() + Number(customMinutes));
      updateData.verified_until = untilDate.toISOString();
    } else {
      updateData.is_verified = 0;
      updateData.verified_until = null;
    }
    await firestoreDb.collection('users').doc(String(uId)).update(updateData);
    return true;
  }

  const db = await readDb();
  const user = db.users.find(u => u.id === uId);
  if (user) {
    if (grantTick) {
      user.is_verified = 1;
      const untilDate = new Date();
      untilDate.setMinutes(untilDate.getMinutes() + Number(customMinutes));
      user.verified_until = untilDate.toISOString();
    } else {
      user.is_verified = 0;
      user.verified_until = null;
    }
    await writeDb(db);
    return true;
  }
  return false;
}

async function addReaction(messageId, userId, emoji) {
  const mId = Number(messageId);
  const uId = Number(userId);

  if (firestoreDb) {
    const docRef = firestoreDb.collection('messages').doc(String(mId));
    const doc = await docRef.get();
    if (doc.exists) {
      const msg = doc.data();
      if (!msg.reactions) msg.reactions = {};
      const existingEmoji = msg.reactions[uId];
      let finalEmoji = emoji;
      if (existingEmoji === emoji) {
        delete msg.reactions[uId];
        finalEmoji = null;
      } else {
        msg.reactions[uId] = emoji;
      }
      await docRef.update({ reactions: msg.reactions });
      return { msg, emoji: finalEmoji };
    }
    return null;
  }

  const db = await readDb();
  const msg = db.messages.find(m => m.id === mId);
  if (msg) {
    if (!msg.reactions) msg.reactions = {};
    const existingEmoji = msg.reactions[uId];
    let finalEmoji = emoji;
    if (existingEmoji === emoji) {
      delete msg.reactions[uId];
      finalEmoji = null;
    } else {
      msg.reactions[uId] = emoji;
    }
    await writeDb(db);
    return { msg, emoji: finalEmoji };
  }
  return null;
}

// --- FRIEND OPERATIONS ---

async function sendFriendRequest(senderId, receiverId) {
  const sId = Number(senderId);
  const rId = Number(receiverId);

  if (sId === rId) return { error: 'Cannot send request to yourself' };

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('friendships')
      .where('user_id_1', 'in', [sId, rId])
      .get();
    
    let existing = null;
    snapshot.forEach(doc => {
      const f = doc.data();
      if ((f.user_id_1 === sId && f.user_id_2 === rId) || (f.user_id_1 === rId && f.user_id_2 === sId)) {
        existing = f;
      }
    });

    if (existing) return { error: 'Friendship or request already exists' };

    const newReqId = await getNextId('friendships');
    const request = {
      id: newReqId,
      user_id_1: sId,
      user_id_2: rId,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    await firestoreDb.collection('friendships').doc(String(newReqId)).set(request);
    return request;
  }

  const db = await readDb();
  const existing = db.friendships.find(f => 
    (f.user_id_1 === sId && f.user_id_2 === rId) || 
    (f.user_id_1 === rId && f.user_id_2 === sId)
  );

  if (existing) return { error: 'Friendship or request already exists' };

  const request = {
    id: db.friendships.length ? Math.max(...db.friendships.map(f => f.id)) + 1 : 1,
    user_id_1: sId,
    user_id_2: rId,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  db.friendships.push(request);
  await writeDb(db);
  return request;
}

async function acceptFriendRequest(requestId, receiverId) {
  const rId = Number(requestId);
  const recId = Number(receiverId);

  if (firestoreDb) {
    const docRef = firestoreDb.collection('friendships').doc(String(rId));
    const doc = await docRef.get();
    if (!doc.exists) return { error: 'Request not found' };
    const request = doc.data();
    if (request.user_id_2 !== recId) return { error: 'Unauthorized to accept this request' };
    if (request.status === 'accepted') return { error: 'Already accepted' };

    await docRef.update({ status: 'accepted' });
    request.status = 'accepted';
    return request;
  }

  const db = await readDb();
  const request = db.friendships.find(f => f.id === rId);
  
  if (!request) return { error: 'Request not found' };
  if (request.user_id_2 !== recId) return { error: 'Unauthorized to accept this request' };
  if (request.status === 'accepted') return { error: 'Already accepted' };

  request.status = 'accepted';
  await writeDb(db);
  return request;
}

async function rejectFriendRequest(requestId, userId) {
  const rId = Number(requestId);
  const uId = Number(userId);

  if (firestoreDb) {
    const docRef = firestoreDb.collection('friendships').doc(String(rId));
    const doc = await docRef.get();
    if (!doc.exists) return { error: 'Request not found' };
    const request = doc.data();
    if (request.user_id_1 !== uId && request.user_id_2 !== uId) {
      return { error: 'Unauthorized' };
    }
    await docRef.delete();
    return { success: true };
  }

  const db = await readDb();
  const index = db.friendships.findIndex(f => f.id === rId);
  
  if (index === -1) return { error: 'Request not found' };
  
  const request = db.friendships[index];
  if (request.user_id_1 !== uId && request.user_id_2 !== uId) {
    return { error: 'Unauthorized' };
  }

  db.friendships.splice(index, 1);
  await writeDb(db);
  return { success: true };
}

async function deleteFriend(userId, targetUserId) {
  const u1 = Number(userId);
  const u2 = Number(targetUserId);

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('friendships')
      .where('user_id_1', 'in', [u1, u2])
      .get();
    
    let docId = null;
    snapshot.forEach(doc => {
      const f = doc.data();
      if ((f.user_id_1 === u1 && f.user_id_2 === u2) || (f.user_id_1 === u2 && f.user_id_2 === u1)) {
        docId = doc.id;
      }
    });

    if (!docId) return { error: 'Friendship not found' };
    await firestoreDb.collection('friendships').doc(docId).delete();
    return { success: true };
  }

  const db = await readDb();
  const index = db.friendships.findIndex(f => 
    (f.user_id_1 === u1 && f.user_id_2 === u2) || 
    (f.user_id_1 === u2 && f.user_id_2 === u1)
  );
  
  if (index === -1) return { error: 'Friendship not found' };
  
  db.friendships.splice(index, 1);
  await writeDb(db);
  return { success: true };
}

async function getFriendsList(userId) {
  const uId = Number(userId);
  
  const friends = [];
  const pendingIncoming = [];
  const pendingOutgoing = [];

  if (firestoreDb) {
    const userSnapshot = await firestoreDb.collection('users').get();
    const allUsers = {};
    userSnapshot.forEach(doc => {
      const u = doc.data();
      allUsers[u.id] = u;
    });

    const friendshipsSnapshot = await firestoreDb.collection('friendships')
      .where('user_id_1', '==', uId)
      .get();
    const friendshipsSnapshot2 = await firestoreDb.collection('friendships')
      .where('user_id_2', '==', uId)
      .get();
    
    const list = [];
    friendshipsSnapshot.forEach(doc => list.push(doc.data()));
    friendshipsSnapshot2.forEach(doc => list.push(doc.data()));

    for (const f of list) {
      if (f.status === 'accepted') {
        const otherId = f.user_id_1 === uId ? f.user_id_2 : f.user_id_1;
        const user = allUsers[otherId];
        if (user) {
          friends.push({
            friendship_id: f.id,
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            is_verified: user.is_verified || 0,
            is_admin: user.is_admin || 0
          });
        }
      } else if (f.status === 'pending') {
        if (f.user_id_2 === uId) {
          const sender = allUsers[f.user_id_1];
          if (sender) pendingIncoming.push({
            request_id: f.id,
            id: sender.id,
            username: sender.username,
            display_name: sender.display_name,
            avatar_url: sender.avatar_url
          });
        } else if (f.user_id_1 === uId) {
          const receiver = allUsers[f.user_id_2];
          if (receiver) pendingOutgoing.push({
            request_id: f.id,
            id: receiver.id,
            username: receiver.username,
            display_name: receiver.display_name,
            avatar_url: receiver.avatar_url
          });
        }
      }
    }
    return { friends, pendingIncoming, pendingOutgoing };
  }

  const db = await readDb();
  for (const f of db.friendships) {
    if (f.status === 'accepted' && (f.user_id_1 === uId || f.user_id_2 === uId)) {
      const otherId = f.user_id_1 === uId ? f.user_id_2 : f.user_id_1;
      const user = db.users.find(u => u.id === otherId);
      if (user) {
        friends.push({
          friendship_id: f.id,
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          is_verified: user.is_verified,
          is_admin: user.is_admin
        });
      }
    } else if (f.status === 'pending') {
      if (f.user_id_2 === uId) {
        const sender = db.users.find(u => u.id === f.user_id_1);
        if (sender) pendingIncoming.push({
          request_id: f.id,
          id: sender.id,
          username: sender.username,
          display_name: sender.display_name,
          avatar_url: sender.avatar_url
        });
      } else if (f.user_id_1 === uId) {
        const receiver = db.users.find(u => u.id === f.user_id_2);
        if (receiver) pendingOutgoing.push({
          request_id: f.id,
          id: receiver.id,
          username: receiver.username,
          display_name: receiver.display_name,
          avatar_url: receiver.avatar_url
        });
      }
    }
  }

  return { friends, pendingIncoming, pendingOutgoing };
}

async function getFriendStatus(user1, user2) {
  const u1 = Number(user1);
  const u2 = Number(user2);
  
  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('friendships')
      .where('user_id_1', 'in', [u1, u2])
      .get();
    
    let f = null;
    snapshot.forEach(doc => {
      const data = doc.data();
      if ((data.user_id_1 === u1 && data.user_id_2 === u2) || (data.user_id_1 === u2 && data.user_id_2 === u1)) {
        f = data;
      }
    });

    if (!f) return 'none';
    if (f.status === 'accepted') return 'friends';
    if (f.status === 'pending') {
      return f.user_id_1 === u1 ? 'request_sent' : 'request_received';
    }
    return 'none';
  }

  const db = await readDb();
  const f = db.friendships.find(f => 
    (f.user_id_1 === u1 && f.user_id_2 === u2) || 
    (f.user_id_1 === u2 && f.user_id_2 === u1)
  );

  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  if (f.status === 'pending') {
    return f.user_id_1 === u1 ? 'request_sent' : 'request_received';
  }
  return 'none';
}

async function isBlocked(userId, targetUserId) {
  const uId = Number(userId);
  const tId = Number(targetUserId);

  if (firestoreDb) {
    const snapshot1 = await firestoreDb.collection('blocked_users')
      .where('user_id', '==', uId)
      .where('blocked_user_id', '==', tId)
      .get();
    const snapshot2 = await firestoreDb.collection('blocked_users')
      .where('user_id', '==', tId)
      .where('blocked_user_id', '==', uId)
      .get();
    return !snapshot1.empty || !snapshot2.empty;
  }

  const db = await readDb();
  if (!db.blocked_users) return false;
  return db.blocked_users.some(b => 
    (b.user_id === uId && b.blocked_user_id === tId) ||
    (b.user_id === tId && b.blocked_user_id === uId)
  );
}

async function isBlockedBy(userId, targetUserId) {
  const uId = Number(userId);
  const tId = Number(targetUserId);

  if (firestoreDb) {
    const snapshot = await firestoreDb.collection('blocked_users')
      .where('user_id', '==', uId)
      .where('blocked_user_id', '==', tId)
      .get();
    return !snapshot.empty;
  }

  const db = await readDb();
  if (!db.blocked_users) return false;
  return db.blocked_users.some(b => b.user_id === uId && b.blocked_user_id === tId);
}

async function blockUser(userId, targetUserId) {
  const uId = Number(userId);
  const tId = Number(targetUserId);
  
  if (uId === tId) return { error: 'Cannot block yourself' };

  if (firestoreDb) {
    const alreadyBlocked = await isBlockedBy(uId, tId);
    if (alreadyBlocked) return { error: 'User already blocked' };

    await firestoreDb.collection('blocked_users').doc(`${uId}_${tId}`).set({
      user_id: uId,
      blocked_user_id: tId,
      created_at: new Date().toISOString()
    });
    return { success: true };
  }

  const db = await readDb();
  if (!db.blocked_users) db.blocked_users = [];
  
  const existing = db.blocked_users.some(b => b.user_id === uId && b.blocked_user_id === tId);
  if (existing) return { error: 'User already blocked' };
  
  db.blocked_users.push({
    user_id: uId,
    blocked_user_id: tId,
    created_at: new Date().toISOString()
  });
  
  await writeDb(db);
  return { success: true };
}

async function unblockUser(userId, targetUserId) {
  const uId = Number(userId);
  const tId = Number(targetUserId);

  if (firestoreDb) {
    const docRef = firestoreDb.collection('blocked_users').doc(`${uId}_${tId}`);
    const doc = await docRef.get();
    if (!doc.exists) return { error: 'User is not blocked' };
    await docRef.delete();
    return { success: true };
  }

  const db = await readDb();
  if (!db.blocked_users) return { error: 'User is not blocked' };
  
  const index = db.blocked_users.findIndex(b => b.user_id === uId && b.blocked_user_id === tId);
  if (index === -1) return { error: 'User is not blocked' };
  
  db.blocked_users.splice(index, 1);
  await writeDb(db);
  return { success: true };
}

// Helpers for backward compatibility
async function leaveGroup(groupId, userId) {
  const gId = Number(groupId);
  const uId = Number(userId);

  if (firestoreDb) {
    await firestoreDb.collection('group_members').doc(`${gId}_${uId}`).delete();
    return;
  }

  const db = await readDb();
  db.group_members = db.group_members.filter(gm => !(gm.group_id === gId && gm.user_id === uId));
  await writeDb(db);
}

module.exports = {
  initDb,
  getUserById,
  getUserByUsername,
  createUser,
  searchUsers,
  updateUserProfile,
  changeUserPassword,
  getGroupById,
  createGroup,
  addGroupMember,
  isGroupMember,
  getGroupMembers,
  updateGroupSettings,
  setGroupAdmin,
  getUserGroups,
  saveMessage,
  getPrivateMessages,
  getGroupMessages,
  markMessagesAsRead,
  markMessagesAsDelivered,
  deleteMessage,
  deleteChat,
  getChats,
  updateUserLastSeen,
  createVerificationRequest,
  getVerificationRequests,
  updateVerificationRequest,
  getAllUsersAdmin,
  updateUserAdminRole,
  banUser,
  unbanUser,
  updateUserBlueTick,
  addReaction,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendsList,
  getFriendStatus,
  deleteFriend,
  isBlocked,
  isBlockedBy,
  blockUser,
  unblockUser
};
