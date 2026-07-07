import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import AdminPanel from './components/AdminPanel';

export default function App() {
  // Config & Session State
  const [serverUrl, setServerUrl] = useState(() => {
    return localStorage.getItem('zihanchat_server_url') || 'https://chaya-pata.onrender.com';
  });
  const [token, setToken] = useState(() => localStorage.getItem('zihanchat_token') || '');
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('zihanchat_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  // Theme & UI State
  const [theme, setTheme] = useState(() => localStorage.getItem('zihanchat_theme') || 'dark');
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const activeChatRef = useRef(null);

  // Sync activeChat state with ref for socket callbacks
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]); // Array of { sender_id, sender_name, chat_type, group_id, typing }
  const [onlineUsers, setOnlineUsers] = useState([]); // Array of user IDs currently online
  const [socket, setSocket] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Custom UI States (Toast & Confirm)
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [confirmDialog, setConfirmDialog] = useState({ show: false, title: '', message: '', onConfirm: null });
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  const showConfirm = (title, message, onConfirm) => {
    setConfirmDialog({ show: true, title, message, onConfirm });
  };

  // Audio chime function
  const audioCtxRef = useRef(null);
  const playChime = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const audioCtx = audioCtxRef.current;
      
      // Handle browser auto-play policies
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.warn('Audio playback prevented by browser'));
      }

      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch(e) {
      console.warn('Audio context failed to play', e);
    }
  };

  // Sync document title with unread notifications
  useEffect(() => {
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) ছায়া.পাতা`;
    } else {
      document.title = 'ছায়া.পাতা';
    }
  }, [unreadCount]);

  // Sync theme with HTML attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zihanchat_theme', theme);
  }, [theme]);

  // Persist server URL change
  useEffect(() => {
    localStorage.setItem('zihanchat_server_url', serverUrl);
  }, [serverUrl]);

  // Handle Socket.io connections & events
  useEffect(() => {
    if (!token || !serverUrl) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    console.log(`Connecting socket to: ${serverUrl}`);
    const newSocket = io(serverUrl, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('Socket connected successfully');
      setSocket(newSocket);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    // Real-time message receiver
    newSocket.on('message_received', (msg) => {
      // If message is in currently active chat, append it to messages
      const currentChat = activeChatRef.current;
      if (
        currentChat &&
        currentChat.chat_type === msg.chat_type &&
        ((msg.chat_type === 'private' && (msg.sender_id === currentChat.id || msg.receiver_id === currentChat.id)) ||
         (msg.chat_type === 'group' && msg.group_id === currentChat.id))
      ) {
        setMessages(prev => [...prev, msg]);
        // Send read confirmation to server
        if (msg.chat_type === 'private') {
          newSocket.emit('mark_read', { chat_type: 'private', target_id: currentChat.id });
        }
      } else {
        const currentUser = userRef.current;
        if (currentUser && msg.sender_id !== currentUser.id) {
          setUnreadCount(prev => prev + 1);
          playChime();
        }
      }

      // Refresh chat list to update snippet & unread counts
      fetchChatsList();
    });

    // Handle read receipt
    newSocket.on('messages_read_receipt', ({ readerId }) => {
      const currentChat = activeChatRef.current;
      const currentUser = userRef.current;
      if (currentChat && currentUser && currentChat.chat_type === 'private' && currentChat.id === readerId) {
        setMessages(prev => prev.map(m => m.sender_id === currentUser.id ? { ...m, status: 'read' } : m));
      }
      fetchChatsList();
    });

    // Handle delivery receipt
    newSocket.on('messages_delivered_receipt', ({ receiverId }) => {
      const currentChat = activeChatRef.current;
      const currentUser = userRef.current;
      if (currentChat && currentUser && currentChat.chat_type === 'private' && currentChat.id === receiverId) {
        setMessages(prev => prev.map(m => (m.sender_id === currentUser.id && m.status === 'sent') ? { ...m, status: 'delivered' } : m));
      }
      fetchChatsList();
    });

    // Typing statuses
    newSocket.on('typing_status', (typingData) => {
      setTypingUsers(prev => {
        // Remove existing typing indicator for this sender/chat
        const filtered = prev.filter(t => !(t.sender_id === typingData.sender_id && t.chat_type === typingData.chat_type));
        if (typingData.typing) {
          return [...filtered, typingData];
        }
        return filtered;
      });
    });

    // User online status changes
    newSocket.on('user_status_change', ({ userId, online }) => {
      setChats(prev => prev.map(c => (c.chat_type === 'private' && c.id === userId) ? { ...c, online } : c));
      const currentChat = activeChatRef.current;
      if (currentChat && currentChat.chat_type === 'private' && currentChat.id === userId) {
        setActiveChat(prev => ({ ...prev, online }));
      }
    });

    // Group updates
    newSocket.on('group_created', (groupDetails) => {
      fetchChatsList();
    });
    newSocket.on('group_update', ({ groupId }) => {
      fetchChatsList();
    });

    // Handle deleted messages
    newSocket.on('message_deleted', ({ message_id }) => {
      setMessages(prev => prev.filter(m => m.id !== message_id));
      fetchChatsList();
    });

    // Handle reaction
    newSocket.on('message_reacted', ({ message_id, userId, emoji }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === message_id) {
          const newReactions = { ...(m.reactions || {}) };
          if (emoji) newReactions[userId] = emoji;
          else delete newReactions[userId];
          return { ...m, reactions: newReactions };
        }
        return m;
      }));
    });

    // Online Users
    newSocket.on('online_users', (userIds) => {
      setOnlineUsers(userIds);
    });

    // Handle Ban Event
    newSocket.on('banned', () => {
      handleLogout();
      showToast('Your account has been banned by an admin.', 'error');
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [token, serverUrl]);

  // Sync activeChat details with updated chats list
  useEffect(() => {
    if (activeChat && chats.length > 0) {
      const updated = chats.find(c => c.chat_type === activeChat.chat_type && c.id === activeChat.id);
      if (updated) {
        if (updated.name !== activeChat.name || updated.avatar_url !== activeChat.avatar_url || updated.online !== activeChat.online) {
          setActiveChat(prev => ({
            ...prev,
            name: updated.name,
            avatar_url: updated.avatar_url,
            online: updated.online
          }));
        }
      }
    }
  }, [chats, activeChat]);

  // Fetch active chats list
  const fetchChatsList = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${serverUrl}/api/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  };

  // Fetch chats on initial token load
  useEffect(() => {
    if (token) {
      fetchChatsList();
      
      // Fetch fresh user profile
      fetch(`${serverUrl}/api/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (res.status === 403 || res.status === 401) {
          handleLogout();
          showToast('Session expired or account banned', 'error');
          throw new Error('Unauthorized');
        }
        return res.json();
      })
      .then(data => {
        if (data && data.id) {
          setUser(data);
          localStorage.setItem('zihanchat_user', JSON.stringify(data));
        }
      })
      .catch(err => console.error(err));
    }
  }, [token]);

  // Fetch messages when activeChat changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!token || !activeChat) {
        setMessages([]);
        return;
      }

      try {
        const res = await fetch(`${serverUrl}/api/messages/${activeChat.chat_type}/${activeChat.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data);

          // Clear typing indicator for this user when opening their chat
          setTypingUsers(prev => prev.filter(t => 
            !(t.chat_type === activeChat.chat_type && 
              (activeChat.chat_type === 'private' ? t.sender_id === activeChat.id : t.group_id === activeChat.id))
          ));

          // Trigger chat list fetch to update unread badge to 0
          fetchChatsList();
          setUnreadCount(0); // Reset title notification when viewing a chat
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      }
    };

    fetchMessages();
  }, [activeChat, token]);

  // Handle Authentication Success
  const handleAuthSuccess = (newToken, newUser) => {
    localStorage.setItem('zihanchat_token', newToken);
    localStorage.setItem('zihanchat_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  // Handle Log Out
  const handleLogout = () => {
    localStorage.removeItem('zihanchat_token');
    localStorage.removeItem('zihanchat_user');
    setToken('');
    setUser(null);
    setActiveChat(null);
    setChats([]);
    setMessages([]);
    if (socket) socket.disconnect();
  };

  // Toggle App Theme
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Send message API / Socket trigger
  const handleSendMessage = (content, messageType = 'text', image_url = null, reply_to_id = null) => {
    if (!socket || !activeChat) return;

    socket.emit('send_message', {
      chat_type: activeChat.chat_type,
      target_id: activeChat.id,
      content,
      message_type: messageType,
      image_url: image_url,
      reply_to_id: reply_to_id
    }, (ack) => {
      if (ack && ack.status === 'ok') {
        setMessages(prev => [...prev, ack.message]);
        // Update snippet in sidebar list
        fetchChatsList();
      } else {
        console.error('Message delivery failed:', ack?.error);
      }
    });
  };

  const handleDeleteMessage = (messageId) => {
    if (!socket || !activeChat) return;
    socket.emit('delete_message', {
      message_id: messageId,
      chat_type: activeChat.chat_type,
      target_id: activeChat.id
    }, (ack) => {
      if (ack && ack.status === 'ok') {
        setMessages(prev => prev.filter(m => m.id !== messageId));
        fetchChatsList();
        showToast('Message deleted for everyone', 'success');
      } else {
        showToast(ack?.error || 'Failed to delete message', 'error');
      }
    });
  };

  const handleDeleteChat = async () => {
    if (!activeChat) return;
    try {
      const res = await fetch(`${serverUrl}/api/chats/${activeChat.chat_type}/${activeChat.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Chat deleted successfully', 'success');
        setActiveChat(null);
        fetchChatsList();
      } else {
        showToast('Failed to delete chat', 'error');
      }
    } catch (err) {
      showToast('Server error', 'error');
    }
  };

  const handleUnfriend = async () => {
    if (!activeChat || activeChat.chat_type !== 'private') return;
    try {
      const res = await fetch(`${serverUrl}/api/friends/${activeChat.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Friend removed', 'success');
        fetchChatsList();
        // optionally keep chat open or close it
      } else {
        showToast('Failed to remove friend', 'error');
      }
    } catch (err) {
      showToast('Server error', 'error');
    }
  };

  const handlePinChat = async (chat) => {
    try {
      const res = await fetch(`${serverUrl}/api/users/pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ chat_type: chat.chat_type, target_id: chat.id })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(prev => ({ ...prev, pinned_chats: data.pinned_chats }));
      } else {
        showToast(data.error || 'Failed to pin chat', 'error');
      }
    } catch (err) {
      showToast('Server error', 'error');
    }
  };

  const handleGroupCreated = (groupDetails) => {
    fetchChatsList();
    // Select the new group chat
    setActiveChat({
      id: groupDetails.id,
      name: groupDetails.name,
      chat_type: 'group',
      avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(groupDetails.name)}&background=009688&color=fff&size=128&bold=true`,
      unread_count: 0
    });
  };

  if (!user) {
    return (
      <Auth
        serverUrl={serverUrl}
        setServerUrl={setServerUrl}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  return (
    <div className="app-container">
      <div className="glass-panel" style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: 'var(--glass-shadow)'
      }}>
        
        {/* Left Sidebar */}
        <div className={`sidebar-wrapper ${activeChat ? 'mobile-hidden' : 'sidebar-mobile'}`} style={{ width: 'var(--sidebar-width)', flexShrink: 0, borderRight: 'var(--glass-border)', display: 'flex', flexDirection: 'column' }}>
          <Sidebar
            user={user}
            chats={chats}
            activeChat={activeChat}
            onChatSelect={setActiveChat}
            theme={theme}
            toggleTheme={toggleTheme}
            onLogout={handleLogout}
            serverUrl={serverUrl}
            token={token}
            onGroupCreated={handleGroupCreated}
            typingUsers={typingUsers}
            onlineUsers={onlineUsers}
            showToast={showToast}
            showConfirm={showConfirm}
            onOpenAdmin={() => setShowAdminPanel(true)}
            fetchChatsList={fetchChatsList}
            socket={socket}
          />
        </div>

        {/* Right Chat Pane */}
        <div className={`chat-wrapper ${!activeChat ? 'mobile-hidden' : 'chat-mobile'}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
          <ChatWindow
            activeChat={activeChat}
            messages={messages}
            user={user}
            onSendMessage={handleSendMessage}
            onDeleteMessage={handleDeleteMessage}
            onDeleteChat={handleDeleteChat}
            onUnfriend={handleUnfriend}
            onPinChat={() => handlePinChat(activeChat)}
            onBack={() => setActiveChat(null)}
            serverUrl={serverUrl}
            token={token}
            socket={socket}
            typingUsers={typingUsers}
            onlineUsers={onlineUsers}
            showToast={showToast}
            showConfirm={showConfirm}
          />
        </div>

      </div>

      {/* --- CUSTOM TOAST NOTIFICATION --- */}
      {toast.show && (
        <div className="animate-fade-in-up" style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'error' ? 'rgba(255, 82, 82, 0.9)' : (toast.type === 'success' ? 'rgba(0, 230, 118, 0.9)' : 'rgba(0, 191, 165, 0.9)'),
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '30px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          zIndex: 1000,
          fontWeight: '500',
          fontSize: '14px',
          backdropFilter: 'blur(8px)'
        }}>
          {toast.message}
        </div>
      )}

      {/* --- CUSTOM CONFIRM MODAL --- */}
      {confirmDialog.show && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 11000
        }}>
          <div className="glass-panel animate-pop-in" style={{
            width: '90%',
            maxWidth: '320px',
            borderRadius: '24px', // rounder corners
            padding: '24px',
            boxShadow: 'var(--glass-shadow)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>{confirmDialog.title}</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                onClick={() => setConfirmDialog({ show: false, title: '', message: '', onConfirm: null })}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                  setConfirmDialog({ show: false, title: '', message: '', onConfirm: null });
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                  background: 'var(--primary)', color: '#000', cursor: 'pointer', fontWeight: '600'
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      
      {showAdminPanel && user && user.is_admin === 1 && (
        <AdminPanel
          serverUrl={serverUrl}
          token={token}
          user={user}
          onClose={() => setShowAdminPanel(false)}
          showToast={showToast}
          showConfirm={showConfirm}
        />
      )}
    </div>
  );
}
