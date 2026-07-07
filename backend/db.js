const fs = require('fs/promises');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');

// Helper to read database
async function readDb() {
  let content = '';
  try {
    content = await fs.readFile(DB_FILE, 'utf-8');
  } catch (error) {
    // If file doesn't exist, return empty database structure
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

  // Parse OUTSIDE the catch block. If this fails, the DB is corrupt and we MUST crash 
  // rather than returning an empty DB to be overwritten.
  const data = JSON.parse(content);
  
  let dbUpdated = false;
  const now = new Date();
  
  // Process expirations
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
    // Don't await to avoid blocking read, just fire and forget
    writeDb(data).catch(console.error);
  }

  return data;
}

// Helper to write database
async function writeDb(data) {
  const tempPath = DB_FILE + '.tmp';
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, DB_FILE);
}

// Initialize database file
async function initDb() {
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

// --- USER OPERATIONS ---

async function getUserById(id) {
  const db = await readDb();
  return db.users.find(u => u.id === Number(id)) || null;
}

async function getUserByUsername(username) {
  const db = await readDb();
  const cleanUsername = username.trim().toLowerCase();
  return db.users.find(u => u.username === cleanUsername) || null;
}

async function createUser(username, password_hash, display_name, avatar_url) {
  const db = await readDb();
  const cleanUsername = username.trim().toLowerCase();

  const newUser = {
    id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
    username: cleanUsername,
    password_hash,
    display_name: display_name.trim(),
    avatar_url,
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    is_verified: 0,
    verified_until: null,
    is_admin: 0
  };

  db.users.push(newUser);
  await writeDb(db);
  return newUser;
}

async function searchUsers(query, excludeUserId) {
  const db = await readDb();
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery === '') return [];

  return db.users
    .filter(u => u.id !== Number(excludeUserId) && (u.username.includes(cleanQuery) || u.display_name.toLowerCase().includes(cleanQuery)))
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
  const db = await readDb();
  return db.groups.find(g => g.id === Number(groupId)) || null;
}

async function createGroup(name, creatorId, memberIds = []) {
  const db = await readDb();
  const newGroupId = db.groups.length > 0 ? Math.max(...db.groups.map(g => g.id)) + 1 : 1;

  const newGroup = {
    id: newGroupId,
    name: name.trim(),
    avatar_url: null,
    created_by: Number(creatorId),
    created_at: new Date().toISOString()
  };

  db.groups.push(newGroup);

  // Add creator as admin member
  db.group_members.push({
    group_id: newGroupId,
    user_id: Number(creatorId),
    joined_at: new Date().toISOString(),
    is_admin: 1
  });

  // Add other members
  for (const mId of memberIds) {
    const memberId = Number(mId);
    if (memberId === Number(creatorId)) continue;
    // Check if user exists
    const userExists = db.users.some(u => u.id === memberId);
    if (userExists) {
      db.group_members.push({
        group_id: newGroupId,
        user_id: memberId,
        joined_at: new Date().toISOString(),
        is_admin: 0
      });
    }
  }

  await writeDb(db);
  return newGroup;
}

async function addGroupMember(groupId, username) {
  const db = await readDb();
  const user = db.users.find(u => u.username === username.trim().toLowerCase());
  if (!user) throw new Error('User not found');

  const gId = Number(groupId);
  const alreadyMember = db.group_members.some(gm => gm.group_id === gId && gm.user_id === user.id);

  if (!alreadyMember) {
    db.group_members.push({
      group_id: gId,
      user_id: user.id,
      joined_at: new Date().toISOString(),
      is_admin: 0
    });
    await writeDb(db);
  }

  return user;
}

async function isGroupMember(groupId, userId) {
  const db = await readDb();
  return db.group_members.some(gm => gm.group_id === Number(groupId) && gm.user_id === Number(userId));
}

async function getGroupMembers(groupId) {
  const db = await readDb();
  const gId = Number(groupId);
  const group = db.groups.find(g => g.id === gId);
  const groupMembers = db.group_members.filter(gm => gm.group_id === gId);
  const memberIds = groupMembers.map(gm => gm.user_id);
  
  return db.users
    .filter(u => memberIds.includes(u.id))
    .map(u => {
      const gm = groupMembers.find(m => m.user_id === u.id);
      let isAdmin = 0;
      if (gm) {
        isAdmin = gm.is_admin === 1 ? 1 : 0;
      } else if (group && group.created_by === u.id) {
        isAdmin = 1;
      }
      
      return {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        is_verified: u.is_verified,
        is_admin: isAdmin
      };
    });
}

async function updateGroupSettings(groupId, name, avatarUrl) {
  const db = await readDb();
  const group = db.groups.find(g => g.id === Number(groupId));
  if (!group) throw new Error('Group not found');

  if (name) group.name = name.trim();
  if (avatarUrl !== undefined) group.avatar_url = avatarUrl;
  
  await writeDb(db);
  return group;
}

async function setGroupAdmin(groupId, userId, isAdmin) {
  const db = await readDb();
  const gm = db.group_members.find(gm => gm.group_id === Number(groupId) && gm.user_id === Number(userId));
  if (!gm) throw new Error('Member not found in group');
  
  gm.is_admin = isAdmin ? 1 : 0;
  await writeDb(db);
  return gm;
}

async function getUserGroups(userId) {
  const db = await readDb();
  const uId = Number(userId);
  const groupIds = db.group_members.filter(gm => gm.user_id === uId).map(gm => gm.group_id);
  return db.groups.filter(g => groupIds.includes(g.id));
}

// --- MESSAGE OPERATIONS ---

async function saveMessage(senderId, receiverId, chatType, groupId, content, messageType = 'text', status = 'sent', image_url = null, reply_to_id = null) {
  const db = await readDb();
  const newMsgId = db.messages.length > 0 ? Math.max(...db.messages.map(m => m.id)) + 1 : 1;

  const newMessage = {
    id: newMsgId,
    sender_id: Number(senderId),
    receiver_id: receiverId ? Number(receiverId) : null,
    chat_type: chatType,
    group_id: groupId ? Number(groupId) : null,
    content: content ? content.trim() : '',
    message_type: messageType,
    image_url: image_url,
    reactions: {}, // Map of userId -> emoji
    status: status,
    is_read: 0,
    reply_to_id: reply_to_id ? Number(reply_to_id) : null,
    created_at: new Date().toISOString()
  };

  db.messages.push(newMessage);
  await writeDb(db);
  return newMessage;
}

async function getPrivateMessages(userId, contactId) {
  const db = await readDb();
  const uId = Number(userId);
  const cId = Number(contactId);

  // Filter messages between the two users
  const messages = db.messages.filter(m => 
    m.chat_type === 'private' && 
    ((m.sender_id === uId && m.receiver_id === cId) || (m.sender_id === cId && m.receiver_id === uId))
  );

  return messages;
}

async function getGroupMessages(groupId) {
  const db = await readDb();
  const gId = Number(groupId);

  const messages = db.messages.filter(m => m.chat_type === 'group' && m.group_id === gId);

  // Attach sender names
  return messages.map(m => {
    const sender = db.users.find(u => u.id === m.sender_id);
    return {
      ...m,
      sender_name: sender ? sender.display_name : 'Unknown User',
      sender_username: sender ? sender.username : 'unknown',
      sender_is_verified: sender ? sender.is_verified : 0
    };
  });
}

async function markMessagesAsRead(senderId, receiverId) {
  const db = await readDb();
  const sId = Number(senderId);
  const rId = Number(receiverId);

  let updated = false;
  db.messages = db.messages.map(m => {
    if (m.chat_type === 'private' && m.sender_id === sId && m.receiver_id === rId && m.is_read !== 1) {
      m.is_read = 1;
      m.status = 'read';
      updated = true;
    }
    return m;
  });

  if (updated) {
    await writeDb(db);
  }
}

async function markMessagesAsDelivered(receiverId) {
  const db = await readDb();
  const rId = Number(receiverId);

  let updated = false;
  db.messages = db.messages.map(m => {
    if (m.chat_type === 'private' && m.receiver_id === rId && m.status === 'sent') {
      m.status = 'delivered';
      updated = true;
    }
    return m;
  });

  if (updated) {
    await writeDb(db);
  }
}

async function deleteMessage(messageId, userId) {
  const db = await readDb();
  const mId = Number(messageId);
  const uId = Number(userId);

  const messageIndex = db.messages.findIndex(m => m.id === mId);
  if (messageIndex === -1) {
    return { success: false, error: 'Message not found' };
  }

  const message = db.messages[messageIndex];
  // Allow delete only if the user is the sender
  if (message.sender_id !== uId) {
    return { success: false, error: 'Unauthorized to delete this message' };
  }

  // Delete message from array
  db.messages.splice(messageIndex, 1);
  await writeDb(db);
  return { success: true, message: 'Message deleted' };
}

async function deleteChat(userId, targetId, chatType) {
  const db = await readDb();
  const uId = Number(userId);
  const tId = Number(targetId);

  if (chatType === 'private') {
    // Delete all messages between these two users
    db.messages = db.messages.filter(m => 
      !(m.chat_type === 'private' && ((m.sender_id === uId && m.receiver_id === tId) || (m.sender_id === tId && m.receiver_id === uId)))
    );
  } else if (chatType === 'group') {
    // Remove user from group
    db.group_members = db.group_members.filter(gm => !(gm.group_id === tId && gm.user_id === uId));
  }

  await writeDb(db);
  return { success: true };
}

// --- ACTIVE CHAT LISTS ---

async function getChats(userId, onlineUsersMap) {
  const db = await readDb();
  const uId = Number(userId);

  const chatsList = [];

  // 1. Find all private contact IDs (who has sent/received messages to/from user)
  const contactIds = new Set();
  db.messages.forEach(m => {
    if (m.chat_type === 'private') {
      if (m.sender_id === uId) contactIds.add(m.receiver_id);
      if (m.receiver_id === uId) contactIds.add(m.sender_id);
    }
  });

  // Fetch private chat details
  for (const cId of contactIds) {
    const contactUser = db.users.find(u => u.id === cId);
    if (!contactUser) continue;

    // Get last message
    const contactMessages = db.messages.filter(m => 
      m.chat_type === 'private' && 
      ((m.sender_id === uId && m.receiver_id === cId) || (m.sender_id === cId && m.receiver_id === uId))
    );
    contactMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const lastMsg = contactMessages[contactMessages.length - 1] || null;

    // Count unread
    const unreadCount = db.messages.filter(m => 
      m.chat_type === 'private' && 
      m.sender_id === cId && 
      m.receiver_id === uId && 
      m.is_read !== 1
    ).length;

    chatsList.push({
      id: contactUser.id,
      name: contactUser.display_name,
      username: contactUser.username,
      avatar_url: contactUser.avatar_url,
      is_verified: contactUser.is_verified,
      chat_type: 'private',
      online: onlineUsersMap.has(contactUser.id),
      last_seen: contactUser.last_seen,
      last_message: lastMsg,
      unread_count: unreadCount,
      updated_at: lastMsg ? lastMsg.created_at : contactUser.created_at
    });
  }

  // 2. Fetch groups where user is member
  const groupIds = db.group_members.filter(gm => gm.user_id === uId).map(gm => gm.group_id);
  const userGroups = db.groups.filter(g => groupIds.includes(g.id));

  for (const group of userGroups) {
    const groupMessages = db.messages.filter(m => m.chat_type === 'group' && m.group_id === group.id);
    groupMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const lastMsg = groupMessages[groupMessages.length - 1] || null;

    let lastMsgData = null;
    if (lastMsg) {
      const sender = db.users.find(u => u.id === lastMsg.sender_id);
      const senderName = sender ? sender.display_name : 'Unknown';
      lastMsgData = {
        id: lastMsg.id,
        sender_id: lastMsg.sender_id,
        sender_name: senderName,
        content: lastMsg.sender_id === uId ? lastMsg.content : `${senderName}: ${lastMsg.content}`,
        created_at: lastMsg.created_at,
        message_type: lastMsg.message_type
      };
    }

    chatsList.push({
      id: group.id,
      name: group.name,
      chat_type: 'group',
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=009688&color=fff&size=128&bold=true`,
      last_message: lastMsgData,
      unread_count: 0, // simplified for groups
      updated_at: lastMsg ? lastMsg.created_at : group.created_at
    });
  }

  // Sort chats by last activity time
  chatsList.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return chatsList;
}

async function updateUserLastSeen(userId, timestamp) {
  const db = await readDb();
  const uId = Number(userId);
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
  const db = await readDb();
  const uId = Number(userId);

  // Check if pending request already exists
  const existing = db.verification_requests.find(r => r.user_id === uId && r.status === 'pending');
  if (existing) return { error: 'Request already pending' };

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
  const db = await readDb();
  // Return pending requests with user info
  const pending = db.verification_requests.filter(r => r.status === 'pending');
  return pending.map(r => {
    const user = db.users.find(u => u.id === r.user_id);
    return {
      ...r,
      username: user ? user.username : 'Unknown',
      display_name: user ? user.display_name : 'Unknown',
      avatar_url: user ? user.avatar_url : ''
    };
  });
}

async function updateVerificationRequest(requestId, status, customMinutes = null) {
  const db = await readDb();
  const reqId = Number(requestId);
  
  const request = db.verification_requests.find(r => r.id === reqId);
  if (!request || request.status !== 'pending') return { error: 'Request not found or already processed' };

  request.status = status;

  if (status === 'approved') {
    const user = db.users.find(u => u.id === request.user_id);
    if (user) {
      user.is_verified = 1;
      const minutesToGrant = customMinutes !== null ? Number(customMinutes) : request.duration_hours * 60;
      const untilDate = new Date();
      untilDate.setMinutes(untilDate.getMinutes() + minutesToGrant);
      user.verified_until = untilDate.toISOString();
    }
  }

  await writeDb(db);
  return { success: true };
}

async function getAllUsersAdmin() {
  const db = await readDb();
  return db.users.map(u => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    is_admin: u.is_admin || 0,
    is_owner: u.id === 1 ? 1 : 0,
    is_verified: u.is_verified || 0,
    verified_until: u.verified_until || null,
    is_banned: u.is_banned || 0,
    created_at: u.created_at
  }));
}

async function updateUserAdminRole(targetUserId, isAdmin) {
  const db = await readDb();
  const tId = Number(targetUserId);
  const user = db.users.find(u => u.id === tId);
  if (!user) return { error: 'User not found' };
  
  user.is_admin = isAdmin ? 1 : 0;
  await writeDb(db);
  return { success: true };
}

async function banUser(userId) {
  const db = await readDb();
  const user = db.users.find(u => u.id === Number(userId));
  if (user) {
    user.is_banned = 1;
    await writeDb(db);
    return true;
  }
  return false;
}

async function unbanUser(userId) {
  const db = await readDb();
  const user = db.users.find(u => u.id === Number(userId));
  if (user) {
    user.is_banned = 0;
    await writeDb(db);
    return true;
  }
  return false;
}

async function updateUserBlueTick(userId, grantTick, customMinutes = 0) {
  const db = await readDb();
  const user = db.users.find(u => u.id === Number(userId));
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
  const db = await readDb();
  const msg = db.messages.find(m => m.id === Number(messageId));
  if (msg) {
    if (!msg.reactions) msg.reactions = {};
    const existingEmoji = msg.reactions[userId];
    let finalEmoji = emoji;
    if (existingEmoji === emoji) {
      delete msg.reactions[userId];
      finalEmoji = null;
    } else {
      msg.reactions[userId] = emoji;
    }
    await writeDb(db);
    return { msg, emoji: finalEmoji };
  }
  return null;
}

// --- FRIEND OPERATIONS ---

async function sendFriendRequest(senderId, receiverId) {
  const db = await readDb();
  if (senderId === receiverId) return { error: 'Cannot send request to yourself' };
  
  const existing = db.friendships.find(f => 
    (f.user_id_1 === senderId && f.user_id_2 === receiverId) || 
    (f.user_id_1 === receiverId && f.user_id_2 === senderId)
  );

  if (existing) return { error: 'Friendship or request already exists' };

  const request = {
    id: db.friendships.length ? Math.max(...db.friendships.map(f => f.id)) + 1 : 1,
    user_id_1: Number(senderId),
    user_id_2: Number(receiverId),
    status: 'pending', // 'pending' means user_id_1 requested user_id_2
    created_at: new Date().toISOString()
  };

  db.friendships.push(request);
  await writeDb(db);
  return request;
}

async function acceptFriendRequest(requestId, receiverId) {
  const db = await readDb();
  const request = db.friendships.find(f => f.id === Number(requestId));
  
  if (!request) return { error: 'Request not found' };
  if (request.user_id_2 !== Number(receiverId)) return { error: 'Unauthorized to accept this request' };
  if (request.status === 'accepted') return { error: 'Already accepted' };

  request.status = 'accepted';
  await writeDb(db);
  return request;
}

async function rejectFriendRequest(requestId, userId) {
  const db = await readDb();
  const index = db.friendships.findIndex(f => f.id === Number(requestId));
  
  if (index === -1) return { error: 'Request not found' };
  
  const request = db.friendships[index];
  if (request.user_id_1 !== Number(userId) && request.user_id_2 !== Number(userId)) {
    return { error: 'Unauthorized' };
  }

  db.friendships.splice(index, 1);
  await writeDb(db);
  return { success: true };
}

async function deleteFriend(userId, targetUserId) {
  const db = await readDb();
  const u1 = Number(userId);
  const u2 = Number(targetUserId);
  
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
  const db = await readDb();
  const uId = Number(userId);
  
  const friends = [];
  const pendingIncoming = [];
  const pendingOutgoing = [];

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
        // Incoming request
        const sender = db.users.find(u => u.id === f.user_id_1);
        if (sender) pendingIncoming.push({
          request_id: f.id,
          id: sender.id,
          username: sender.username,
          display_name: sender.display_name,
          avatar_url: sender.avatar_url
        });
      } else if (f.user_id_1 === uId) {
        // Outgoing request
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
  const db = await readDb();
  const u1 = Number(user1);
  const u2 = Number(user2);
  
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
  const db = await readDb();
  const uId = Number(userId);
  const tId = Number(targetUserId);
  if (!db.blocked_users) return false;
  return db.blocked_users.some(b => 
    (b.user_id === uId && b.blocked_user_id === tId) ||
    (b.user_id === tId && b.blocked_user_id === uId)
  );
}

async function isBlockedBy(userId, targetUserId) {
  const db = await readDb();
  const uId = Number(userId);
  const tId = Number(targetUserId);
  if (!db.blocked_users) return false;
  return db.blocked_users.some(b => b.user_id === uId && b.blocked_user_id === tId);
}

async function blockUser(userId, targetUserId) {
  const db = await readDb();
  const uId = Number(userId);
  const tId = Number(targetUserId);
  
  if (uId === tId) return { error: 'Cannot block yourself' };
  
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
  const db = await readDb();
  const uId = Number(userId);
  const tId = Number(targetUserId);
  
  if (!db.blocked_users) return { error: 'User is not blocked' };
  
  const index = db.blocked_users.findIndex(b => b.user_id === uId && b.blocked_user_id === tId);
  if (index === -1) return { error: 'User is not blocked' };
  
  db.blocked_users.splice(index, 1);
  await writeDb(db);
  return { success: true };
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
