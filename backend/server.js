const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for local networking
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'whatsapp_secret_key_2026_super_secure';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health Check Endpoint (useful for UptimeRobot)
app.get('/', (req, res) => {
  res.status(200).send('Chaya-Pata Backend is Awake and Running!');
});

// In-memory tracking of online users: userId -> socketId
const onlineUsers = new Map();

// Helper to get socket ID by userId
const getUserSocket = (userId) => onlineUsers.get(Number(userId));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    
    try {
      const fullUser = await db.getUserById(decoded.id);
      if (!fullUser) return res.status(401).json({ error: 'User not found' });
      if (fullUser.is_banned === 1) return res.status(403).json({ error: 'Account Banned', is_banned: true });
      
      req.user = fullUser;
      next();
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });
};

// Admin Middleware
const isAdmin = async (req, res, next) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user || user.is_admin !== 1) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// --- IMAGE UPLOAD PROXY ROUTE ---
app.post('/api/upload-image', authenticateToken, async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'No image provided' });
  }

  try {
    const IMGBB_API_KEY = process.env.IMGBB_API_KEY || 'fe67bacbf7586fd5d2c9b4e9d2969332';
    
    const formData = new URLSearchParams();
    formData.append('image', image);

    const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData,
    });

    const data = await imgbbRes.json();
    if (!imgbbRes.ok) {
      return res.status(imgbbRes.status).json({ error: data.error?.message || 'ImgBB upload failed' });
    }

    res.json({ url: data.data.url });
  } catch (error) {
    console.error('Upload proxy error:', error);
    res.status(500).json({ error: 'Internal server error during upload proxy' });
  }
});

// --- AUTH API ROUTES ---

// Register User
app.post('/api/auth/register', async (req, res) => {
  const { username, password, display_name } = req.body;

  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const cleanUsername = username.trim().toLowerCase();

  if (cleanUsername.length < 3 || cleanUsername.length > 30) {
    return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
  }
  if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: 'Username can only contain lowercase letters, numbers, and underscores' });
  }
  if (display_name.trim().length > 50) {
    return res.status(400).json({ error: 'Display Name cannot exceed 50 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
  if (emojiRegex.test(display_name)) {
    return res.status(400).json({ error: 'Emojis are not allowed in Display Name' });
  }


  try {
    const existing = await db.getUserByUsername(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Generate a default avatar color based on username hash
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#009688', '#4caf50', '#ffeb3b', '#ff9800', '#795548'];
    const colorIndex = Math.abs(cleanUsername.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(display_name)}&background=${colors[colorIndex].replace('#', '')}&color=fff&size=128&bold=true`;

    const newUser = await db.createUser(cleanUsername, passwordHash, display_name, avatarUrl);

    const token = jwt.sign({ id: newUser.id, username: cleanUsername }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        username: cleanUsername,
        display_name: newUser.display_name,
        avatar_url: newUser.avatar_url,
        is_admin: newUser.is_admin || (cleanUsername === 'zihanfakir' ? 1 : 0),
        is_owner: (newUser.id === 1 || cleanUsername === 'zihanfakir') ? 1 : 0,
        is_verified: newUser.is_verified || (cleanUsername === 'zihanfakir' ? 1 : 0),
        verified_until: newUser.verified_until || null,
        pinned_chats: newUser.pinned_chats || []
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const user = await db.getUserByUsername(cleanUsername);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    if (user.is_banned === 1) {
      return res.status(403).json({ error: 'You are banned from using this application.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        is_admin: user.is_admin || (user.username === 'zihanfakir' ? 1 : 0),
        is_owner: (user.id === 1 || user.username === 'zihanfakir') ? 1 : 0,
        is_verified: user.is_verified || (user.username === 'zihanfakir' ? 1 : 0),
        verified_until: user.verified_until || null,
        pinned_chats: user.pinned_chats || []
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- USER & CHAT API ROUTES ---

// Get my profile
app.get('/api/users/me', authenticateToken, async (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_admin: user.is_admin || (user.username === 'zihanfakir' ? 1 : 0),
    is_owner: (user.id === 1 || user.username === 'zihanfakir') ? 1 : 0,
    is_verified: user.is_verified || (user.username === 'zihanfakir' ? 1 : 0),
    verified_until: user.verified_until || null,
    is_banned: user.is_banned || 0,
    pinned_chats: user.pinned_chats || []
  });
});

// Search Users other users (by username)
app.get('/api/users/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  try {
    const users = await db.searchUsers(q || '', req.user.id);
    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user profile
app.get('/api/users/:idOrUsername', authenticateToken, async (req, res) => {
  const param = req.params.idOrUsername;
  try {
    let user;
    if (isNaN(param)) {
      user = await db.getUserByUsername(param);
    } else {
      user = await db.getUserById(Number(param));
    }

    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      is_admin: user.is_admin || 0,
      is_verified: user.is_verified || 0,
      verified_until: user.verified_until || null,
      online: onlineUsers.has(user.id)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  const { display_name, avatar_url } = req.body;
  const updates = {};
  
  if (display_name) {
    if (display_name.trim().length > 50) {
      return res.status(400).json({ error: 'Display Name cannot exceed 50 characters' });
    }
    const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
    if (emojiRegex.test(display_name)) {
      return res.status(400).json({ error: 'Emojis are not allowed in Display Name' });
    }
    updates.display_name = display_name;
  }
  
  if (avatar_url) updates.avatar_url = avatar_url;

  try {
    const updatedUser = await db.updateUserProfile(req.user.id, updates);
    if (!updatedUser) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      display_name: updatedUser.display_name,
      avatar_url: updatedUser.avatar_url
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/users/pin', authenticateToken, async (req, res) => {
  const { chat_type, target_id } = req.body;
  if (!chat_type || !target_id) return res.status(400).json({ error: 'Missing chat details' });
  
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    let pinned = user.pinned_chats || [];
    const pinId = `${chat_type}_${target_id}`;
    
    if (pinned.includes(pinId)) {
      pinned = pinned.filter(id => id !== pinId);
    } else {
      if (pinned.length >= 5) {
        return res.status(400).json({ error: 'You can only pin up to 5 chats' });
      }
      pinned.push(pinId);
    }
    
    await db.updateUserProfile(req.user.id, { pinned_chats: pinned });
    res.json({ pinned_chats: pinned });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

// Block user
app.post('/api/users/block', authenticateToken, async (req, res) => {
  const { target_id } = req.body;
  if (!target_id) return res.status(400).json({ error: 'Missing target user ID' });
  
  try {
    const result = await db.blockUser(req.user.id, target_id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Unblock user
app.delete('/api/users/block/:id', authenticateToken, async (req, res) => {
  const target_id = req.params.id;
  try {
    const result = await db.unblockUser(req.user.id, target_id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get block status
app.get('/api/users/block/status/:id', authenticateToken, async (req, res) => {
  const targetId = Number(req.params.id);
  try {
    const blockedByMe = await db.isBlockedBy(req.user.id, targetId);
    const blockedByThem = await db.isBlockedBy(targetId, req.user.id);
    res.json({ blockedByMe, blockedByThem });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user password
app.put('/api/users/password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing password fields' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }
  
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const result = await db.changeUserPassword(req.user.id, newPasswordHash);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- FRIENDSHIP ROUTES ---

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const list = await db.getFriendsList(req.user.id);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch friends list' });
  }
});

app.get('/api/friends/status/:id', authenticateToken, async (req, res) => {
  try {
    const status = await db.getFriendStatus(req.user.id, req.params.id);
    res.json({ status });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch friend status' });
  }
});

app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const result = await db.sendFriendRequest(req.user.id, req.body.targetId);
    if (result.error) return res.status(400).json({ error: result.error });
    // Also notify receiver if online
    const receiverSocket = onlineUsers.get(Number(req.body.targetId));
    if (receiverSocket) {
      io.to(receiverSocket).emit('friend_request_received', result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const result = await db.acceptFriendRequest(req.body.requestId, req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    // Notify sender
    const senderSocket = onlineUsers.get(Number(result.user_id_1));
    if (senderSocket) {
      io.to(senderSocket).emit('friend_request_accepted', result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/friends/reject', authenticateToken, async (req, res) => {
  try {
    const result = await db.rejectFriendRequest(req.body.requestId, req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/friends/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.deleteFriend(req.user.id, req.params.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a Group
app.post('/api/groups', authenticateToken, async (req, res) => {
  const { name, members, avatar_url } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Group name is required' });
  }
  if (name.trim().length > 50) {
    return res.status(400).json({ error: 'Group name cannot exceed 50 characters' });
  }

  try {
    const group = await db.createGroup(name, req.user.id, members || [], avatar_url);
    
    const groupDetails = {
      id: group.id,
      name: group.name,
      avatar_url: group.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=009688&color=fff&size=128&bold=true`,
      created_by: group.created_by,
      chat_type: 'group'
    };

    // Notify all online group members
    const allMembers = await db.getGroupMembers(group.id);
    allMembers.forEach(member => {
      const socketId = getUserSocket(member.id);
      if (socketId) {
        io.to(socketId).emit('group_created', groupDetails);
      }
    });

    res.status(201).json(groupDetails);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Get Group Members
app.get('/api/groups/:id/members', authenticateToken, async (req, res) => {
  const groupId = Number(req.params.id);
  try {
    const isMember = await db.isGroupMember(groupId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    const members = await db.getGroupMembers(groupId);
    res.json(members);
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({ error: 'Failed to fetch group members' });
  }
});

// Add member to group
app.post('/api/groups/:id/members', authenticateToken, async (req, res) => {
  const groupId = Number(req.params.id);
  const { username } = req.body;

  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const isMember = await db.isGroupMember(groupId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const targetUser = await db.getUserByUsername(username);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.addGroupMember(groupId, targetUser.id);
    const user = targetUser;

    // Save a system message to database
    const systemMsg = await db.saveMessage(
      req.user.id,
      null,
      'group',
      groupId,
      `${user.display_name} joined the group.`,
      'system',
      'sent'
    );

    // Notify group members
    const allMembers = await db.getGroupMembers(groupId);
    allMembers.forEach(member => {
      const socketId = getUserSocket(member.id);
      if (socketId) {
        io.to(socketId).emit('message_received', {
          ...systemMsg,
          sender_name: 'System',
          sender_username: 'system'
        });
        io.to(socketId).emit('group_update', { groupId });
      }
    });

    res.json({ message: 'User added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to add group member' });
  }
});

// Update Group Settings
app.put('/api/groups/:id', authenticateToken, async (req, res) => {
  const groupId = Number(req.params.id);
  const { name, avatar_url } = req.body;
  try {
    const members = await db.getGroupMembers(groupId);
    const caller = members.find(m => m.id === req.user.id);
    if (!caller || caller.is_admin !== 1) {
      return res.status(403).json({ error: 'Only admins can update group settings' });
    }
    const updatedGroup = await db.updateGroupSettings(groupId, name, avatar_url);
    
    // Notify all members
    members.forEach(m => {
      const socketId = getUserSocket(m.id);
      if (socketId) io.to(socketId).emit('group_update', { groupId });
    });
    
    res.json(updatedGroup);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update group settings' });
  }
});

// Set Group Admin
app.post('/api/groups/:id/admins', authenticateToken, async (req, res) => {
  const groupId = Number(req.params.id);
  const { target_user_id, is_admin } = req.body;
  try {
    const members = await db.getGroupMembers(groupId);
    const caller = members.find(m => m.id === req.user.id);
    if (!caller || caller.is_admin !== 1) {
      return res.status(403).json({ error: 'Only admins can manage administrators' });
    }
    await db.setGroupAdmin(groupId, target_user_id, is_admin);
    
    // Notify all members
    members.forEach(m => {
      const socketId = getUserSocket(m.id);
      if (socketId) io.to(socketId).emit('group_update', { groupId });
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to manage group admin' });
  }
});


// Fetch active chat list
app.get('/api/chats', authenticateToken, async (req, res) => {
  try {
    const chats = await db.getChats(req.user.id, onlineUsers);
    res.json(chats);
  } catch (error) {
    console.error('Fetch chats error:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Delete Chat
app.delete('/api/chats/:chatType/:id', authenticateToken, async (req, res) => {
  const { chatType, id } = req.params;
  console.log(`Deleting chat: type=${chatType}, id=${id}, user=${req.user.id}`);
  try {
    const result = await db.deleteChat(req.user.id, id, chatType);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete chat' });
  }
});

// Fetch messages history
app.get('/api/messages/:chatType/:id', authenticateToken, async (req, res) => {
  const chatType = req.params.chatType;
  const targetId = Number(req.params.id);
  const userId = req.user.id;

  try {
    if (chatType === 'private') {
      // Mark messages as read in database
      await db.markMessagesAsRead(targetId, userId);

      // Notify sender that messages are read
      const senderSocketId = getUserSocket(targetId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('messages_read_receipt', { readerId: userId });
      }

      const messages = await db.getPrivateMessages(userId, targetId);
      res.json(messages);
    } else if (chatType === 'group') {
      const isMember = await db.isGroupMember(targetId, userId);
      if (!isMember) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }

      const messages = await db.getGroupMessages(targetId);
      res.json(messages);
    } else {
      res.status(400).json({ error: 'Invalid chat type' });
    }
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// --- ADMIN & VERIFICATION ROUTES ---

// Submit a request for blue tick
app.post('/api/verify/request', authenticateToken, async (req, res) => {
  const { durationHours } = req.body;
  if (!durationHours) return res.status(400).json({ error: 'Duration is required' });

  try {
    const result = await db.createVerificationRequest(req.user.id, durationHours);
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all pending requests (Admin only)
app.get('/api/admin/verify/requests', authenticateToken, isAdmin, async (req, res) => {
  try {
    const requests = await db.getVerificationRequests();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Process Verification Request
app.post('/api/admin/verify/approve/:id', authenticateToken, isAdmin, async (req, res) => {
  const { customMinutes } = req.body;
  try {
    const result = await db.updateVerificationRequest(req.params.id, 'approved', customMinutes);
    if (result.error) return res.status(400).json(result);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Reject verification request
app.post('/api/admin/verify/reject/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await db.updateVerificationRequest(req.params.id, 'rejected');
    if (result.error) return res.status(400).json(result);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users for admin management
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsersAdmin();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle admin role for a user
app.post('/api/admin/users/:id/role', authenticateToken, isAdmin, async (req, res) => {
  const { is_admin } = req.body;
  const targetUser = await db.getUserById(req.params.id);
  if (Number(req.params.id) === 1 || (targetUser && targetUser.username === 'zihanfakir')) {
    return res.status(400).json({ error: 'Cannot modify Owner role' });
  }
  // Prevent removing own admin
  if (Number(req.params.id) === req.user.id && !is_admin) {
    return res.status(400).json({ error: 'Cannot remove your own admin access' });
  }
  
  try {
    const result = await db.updateUserAdminRole(req.params.id, is_admin);
    if (result.error) return res.status(400).json(result);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Ban a user
app.post('/api/admin/users/:id/ban', authenticateToken, isAdmin, async (req, res) => {
  const targetUser = await db.getUserById(req.params.id);
  if (Number(req.params.id) === 1 || (targetUser && targetUser.username === 'zihanfakir')) {
    return res.status(400).json({ error: 'Cannot ban the Owner' });
  }
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot ban yourself' });
  }
  try {
    const result = await db.banUser(req.params.id);
    if (result.error) return res.status(400).json(result);
    
    // Disconnect user if online
    const socketId = getUserSocket(Number(req.params.id));
    if (socketId) {
      io.to(socketId).emit('banned');
      io.sockets.sockets.get(socketId)?.disconnect();
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Unban a user
app.post('/api/admin/users/:id/unban', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await db.unbanUser(req.params.id);
    if (result.error) return res.status(400).json(result);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Give/Revoke Custom Blue Tick directly
app.post('/api/admin/users/:id/bluetick', authenticateToken, isAdmin, async (req, res) => {
  const { action, customMinutes } = req.body;
  try {
    const result = await db.updateUserBlueTick(req.params.id, action === 'give', customMinutes);
    if (result.error) return res.status(400).json(result);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- SOCKET.IO REAL-TIME CHAT SERVICE ---

// Authentication middleware for Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return next(new Error('Authentication error'));
    
    try {
      const fullUser = await db.getUserById(decoded.id);
      if (!fullUser) return next(new Error('User not found'));
      if (fullUser.is_banned === 1) return next(new Error('Account Banned'));
      
      socket.user = fullUser;
      next();
    } catch (e) {
      next(new Error('Server error'));
    }
  });
});

io.on('connection', (socket) => {
  const userId = Number(socket.user.id);
  const username = socket.user.username;

  onlineUsers.set(userId, socket.id);
  console.log(`User connected: ${username} (Socket: ${socket.id})`);

  // Broadcast online status to contacts
  socket.broadcast.emit('user_status_change', { userId, online: true });

  // Update undelivered messages to this user as 'delivered'
  db.markMessagesAsDelivered(userId).then(() => {
    // Notify senders
    onlineUsers.forEach((sid, otherId) => {
      if (otherId !== userId) {
        io.to(sid).emit('messages_delivered_receipt', { receiverId: userId });
      }
    });
  });

  // Handle send message
  socket.on('send_message', async (data, callback) => {
    const { chat_type, target_id, content, message_type, image_url, reply_to_id } = data;

    if ((!content || content.trim() === '') && !image_url) return;
    
    if (content && content.length > 5000) {
      if (callback) callback({ error: 'Message is too long (maximum 5000 characters)' });
      return;
    }

    try {
      if (chat_type === 'private') {
        const isBlocked = await db.isBlocked(userId, target_id);
        if (isBlocked) {
          if (callback) callback({ error: 'Cannot send message. User is blocked.' });
          return;
        }

        const initialStatus = onlineUsers.has(Number(target_id)) ? 'delivered' : 'sent';

        const savedMsg = await db.saveMessage(
          userId,
          Number(target_id),
          'private',
          null,
          content,
          message_type || 'text',
          initialStatus,
          image_url,
          reply_to_id
        );

        const senderInfo = await db.getUserById(userId);

        const messagePayload = {
          ...savedMsg,
          sender_info: {
            id: senderInfo.id,
            username: senderInfo.username,
            display_name: senderInfo.display_name,
            avatar_url: senderInfo.avatar_url
          }
        };

        // Emit to receiver
        const receiverSocketId = getUserSocket(target_id);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('message_received', messagePayload);
        }

        if (callback) callback({ status: 'ok', message: messagePayload });

      } else if (chat_type === 'group') {
        const isMember = await db.isGroupMember(target_id, userId);
        if (!isMember) {
          if (callback) callback({ error: 'Not a group member' });
          return;
        }

        const savedMsg = await db.saveMessage(
          userId,
          null,
          'group',
          Number(target_id),
          content,
          message_type || 'text',
          'sent',
          image_url,
          reply_to_id
        );

        const senderInfo = await db.getUserById(userId);

        const messagePayload = {
          ...savedMsg,
          sender_name: senderInfo.display_name,
          sender_username: senderInfo.username
        };

        // Broadcast to group members
        const groupMembers = await db.getGroupMembers(target_id);
        groupMembers.forEach((member) => {
          if (member.id !== userId) {
            const memberSocketId = getUserSocket(member.id);
            if (memberSocketId) {
              io.to(memberSocketId).emit('message_received', messagePayload);
            }
          }
        });

        if (callback) callback({ status: 'ok', message: messagePayload });
      }
    } catch (error) {
      console.error('Socket send_message error:', error);
      if (callback) callback({ error: 'Failed to send message' });
    }
  });

  // Handle typing indicator
  socket.on('typing', async (data) => {
    const { chat_type, target_id, typing } = data;
    if (chat_type === 'private') {
      const receiverSocketId = getUserSocket(target_id);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('typing_status', {
          sender_id: userId,
          chat_type: 'private',
          typing
        });
      }
    } else if (chat_type === 'group') {
      const members = await db.getGroupMembers(target_id);
      members.forEach(member => {
        if (member.id !== userId) {
          const socketId = getUserSocket(member.id);
          if (socketId) {
            io.to(socketId).emit('typing_status', {
              sender_id: userId,
              sender_name: username,
              chat_type: 'group',
              group_id: target_id,
              typing
            });
          }
        }
      });
    }
  });

  // Handle message read confirmation
  socket.on('mark_read', async (data) => {
    const { chat_type, target_id } = data;

    if (chat_type === 'private') {
      try {
        await db.markMessagesAsRead(target_id, userId);
        const senderSocketId = getUserSocket(target_id);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messages_read_receipt', { readerId: userId });
        }
      } catch (err) {
        console.error(err);
      }
    }
  });

  // Handle delete message
  socket.on('delete_message', async (data, callback) => {
    const { message_id, chat_type, target_id } = data;
    try {
      const result = await db.deleteMessage(message_id, userId);
      if (result.success) {
        // Notify others
        if (chat_type === 'private') {
          const receiverSocketId = getUserSocket(target_id);
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('message_deleted', { message_id, chat_type, target_id: userId });
          }
        } else if (chat_type === 'group') {
          const members = await db.getGroupMembers(target_id);
          members.forEach(member => {
            if (member.id !== userId) {
              const socketId = getUserSocket(member.id);
              if (socketId) {
                io.to(socketId).emit('message_deleted', { message_id, chat_type, target_id });
              }
            }
          });
        }
        if (callback) callback({ status: 'ok', message_id });
      } else {
        if (callback) callback({ error: result.error });
      }
    } catch (err) {
      console.error('Delete message error:', err);
      if (callback) callback({ error: 'Failed to delete message' });
    }
  });

  // Handle reaction to a message
  socket.on('react_message', async (data, callback) => {
    const { message_id, emoji, chat_type, target_id } = data;
    try {
      const result = await db.addReaction(message_id, userId, emoji);
      if (result) {
        const payload = { message_id, userId, emoji: result.emoji, chat_type };
        // Broadcast reaction to target and self
        if (chat_type === 'private') {
          const targetSocketId = getUserSocket(target_id);
          if (targetSocketId) {
            io.to(targetSocketId).emit('message_reacted', payload);
          }
          const selfSocketId = getUserSocket(userId);
          if (selfSocketId) {
            io.to(selfSocketId).emit('message_reacted', payload);
          }
        } else if (chat_type === 'group') {
          const members = await db.getGroupMembers(target_id);
          members.forEach(member => {
            const sock = getUserSocket(member.id);
            if (sock) io.to(sock).emit('message_reacted', payload);
          });
        }
        if (callback) callback({ status: 'ok' });
      }
    } catch (err) {
      if (callback) callback({ error: 'Failed to react' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    onlineUsers.delete(userId);
    console.log(`User disconnected: ${username}`);
    const timestamp = new Date().toISOString();
    await db.updateUserLastSeen(userId, timestamp);
    socket.broadcast.emit('user_status_change', { userId, online: false, last_seen: timestamp });
  });
});

// Start Server
db.initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});
