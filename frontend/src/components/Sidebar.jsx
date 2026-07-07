import React, { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, Users, Settings, LogOut, Sun, Moon, Plus, X, Check, CheckCheck, BadgeCheck, Shield, CheckCircle, Trash2, Pin, MoreVertical } from 'lucide-react';
import confetti from 'canvas-confetti';
import { uploadToImgBB } from '../utils/imgbb';
export default function Sidebar({
  user,
  chats,
  activeChat,
  onChatSelect,
  theme,
  toggleTheme,
  onLogout,
  serverUrl,
  token,
  onGroupCreated,
  typingUsers,
  onlineUsers,
  showToast,
  showConfirm,
  onOpenAdmin,
  fetchChatsList,
  socket
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Group creation modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]); // array of user objects
  const [groupAvatarPreview, setGroupAvatarPreview] = useState(null);
  const groupAvatarInputRef = useRef(null);

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(user?.display_name || '');
  const [editAvatarBase64, setEditAvatarBase64] = useState(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const avatarInputRef = useRef(null);
  
  const [blueTickDuration, setBlueTickDuration] = useState('24');
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Friends System States
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' or 'friends'
  const [friendsData, setFriendsData] = useState({ friends: [], pendingIncoming: [], pendingOutgoing: [] });
  
  const fetchFriends = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${serverUrl}/api/friends`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriendsData(data);
      }
    } catch (err) {
      console.error('Error fetching friends:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'friends') {
      fetchFriends();
    }
  }, [activeTab, token]);

  useEffect(() => {
    if (!socket) return;

    const handleRequestReceived = (data) => {
      showToast('You received a new friend request!', 'info');
      if (activeTab === 'friends') {
        fetchFriends();
      }
    };

    const handleRequestAccepted = (data) => {
      showToast('Your friend request was accepted!', 'success');
      if (activeTab === 'friends') {
        fetchFriends();
      }
    };

    socket.on('friend_request_received', handleRequestReceived);
    socket.on('friend_request_accepted', handleRequestAccepted);

    return () => {
      socket.off('friend_request_received', handleRequestReceived);
      socket.off('friend_request_accepted', handleRequestAccepted);
    };
  }, [socket, activeTab]);

  const handleFriendAction = async (action, requestId) => {
    try {
      const res = await fetch(`${serverUrl}/api/friends/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        showToast(`Request ${action}ed!`, 'success');
        fetchFriends();
      } else {
        const err = await res.json();
        showToast(err.error || `Failed to ${action}`, 'error');
      }
    } catch (e) {
      showToast('Server error', 'error');
    }
  };

  // Search users for starting private chat
  useEffect(() => {
    const searchUsersApi = async () => {
      if (searchQuery.trim() === '') {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(`${serverUrl}/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        console.error('Error searching users:', err);
      }
    };

    const delayDebounce = setTimeout(searchUsersApi, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, serverUrl, token]);

  // Search users for group membership
  useEffect(() => {
    const searchGroupUsers = async () => {
      if (groupSearchQuery.trim() === '') {
        setGroupSearchResults([]);
        return;
      }
      try {
        const res = await fetch(`${serverUrl}/api/users/search?q=${encodeURIComponent(groupSearchQuery)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setGroupSearchResults(data);
      } catch (err) {
        console.error(err);
      }
    };

    const delayDebounce = setTimeout(searchGroupUsers, 300);
    return () => clearTimeout(delayDebounce);
  }, [groupSearchQuery, serverUrl, token]);

  // Start chat with user from search list
  const handleSelectUser = (searchedUser) => {
    // Check if chat already exists in list, if not insert a placeholder
    const existing = chats.find(c => c.chat_type === 'private' && c.id === searchedUser.id);
    if (existing) {
      onChatSelect(existing);
    } else {
      // Create temporary chat representation
      onChatSelect({
        id: searchedUser.id,
        name: searchedUser.display_name,
        username: searchedUser.username,
        avatar_url: searchedUser.avatar_url,
        chat_type: 'private',
        online: false,
        last_message: null,
        unread_count: 0
      });
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleDeleteChat = async (e, chatType, chatId) => {
    e.stopPropagation();
    showConfirm('Delete Chat', 'Are you sure you want to delete this chat history?', async () => {
      try {
        const res = await fetch(`${serverUrl}/api/chats/${chatType}/${chatId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          showToast('Chat deleted successfully', 'success');
          if (activeChat && activeChat.id === chatId && activeChat.chat_type === chatType) {
            onChatSelect(null);
          }
          fetchChatsList();
        } else {
          showToast('Failed to delete chat', 'error');
        }
      } catch (err) {
        showToast('Server error', 'error');
      }
    });
  };

  const handleRemoveFriend = async (e, friendId) => {
    e.stopPropagation();
    showConfirm('Remove Friend', 'Are you sure you want to remove this user from your friend list?', async () => {
      try {
        const res = await fetch(`${serverUrl}/api/friends/${friendId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          showToast('Friend removed successfully', 'success');
          fetchFriends();
        } else {
          showToast('Failed to remove friend', 'error');
        }
      } catch (err) {
        showToast('Server error', 'error');
      }
    });
  };

  const handleToggleMember = (targetUser) => {
    if (selectedGroupMembers.some(m => m.id === targetUser.id)) {
      setSelectedGroupMembers(selectedGroupMembers.filter(m => m.id !== targetUser.id));
    } else {
      setSelectedGroupMembers([...selectedGroupMembers, targetUser]);
    }
  };

  const handleSendFriendRequestFromSearch = async (e, targetId) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${serverUrl}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetId })
      });
      if (res.ok) {
        showToast('Friend request sent!', 'success');
        // Clear search or leave it, depending on UX. Usually leave it is fine.
        setSearchQuery('');
        setSearchResults([]);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to send request', 'error');
      }
    } catch (err) {
      showToast('Server error', 'error');
    }
  };

  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      let avatar_url = null;
      if (groupAvatarInputRef.current?.files?.[0]) {
        showToast('Uploading group image...', 'info');
        avatar_url = await uploadToImgBB(groupAvatarInputRef.current.files[0]);
      }

      const response = await fetch(`${serverUrl}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: groupName.trim(),
          members: selectedGroupMembers.map(m => m.id),
          avatar_url
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create group');

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
      });

      setShowGroupModal(false);
      setGroupName('');
      setSelectedGroupMembers([]);
      setGroupSearchQuery('');
      setGroupSearchResults([]);
      
      if (onGroupCreated) onGroupCreated(data);
      showToast('Group created successfully!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRequestBlueTick = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/verify/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ durationHours: Number(blueTickDuration) })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Blue Tick requested successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to request blue tick', 'error');
      }
    } catch(err) {
      showToast('Server error', 'error');
    }
  };

  // Format time of last message
  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="glass-panel" style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border-color)',
      borderTopLeftRadius: '16px',
      borderBottomLeftRadius: '16px',
      overflow: 'hidden',
      zIndex: 2
    }}>
      
      {/* App Branding Header */}
      <div style={{
        padding: '12px 16px', // thinner padding
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '10px',
        background: 'var(--bg-secondary)'
      }}>
        <img src="/logo.svg" alt="ছায়া.পাতা Logo" style={{ width: '30px', height: '30px', objectFit: 'contain', borderRadius: '6px' }} />
        <h1 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-main)', margin: 0, letterSpacing: '-0.3px' }}>
          ছায়া.পাতা
        </h1>
      </div>

      {/* User Profile Section */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={user.avatar_url}
            alt={user.display_name}
            style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--primary)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>{user.display_name}</span>
              {user.is_verified === 1 && (
                <BadgeCheck size={16} style={{ color: '#00bfa5' }} />
              )}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>@{user.username}</span>
          </div>
        </div>
        
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '50%' }}
            title="Menu"
          >
            <MoreVertical size={20} />
          </button>
          
          {showProfileMenu && (
            <>
              <div 
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} 
                onClick={() => setShowProfileMenu(false)} 
              />
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px 0',
                minWidth: '180px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column'
              }}>
                {user.is_admin === 1 && (
                  <div 
                    onClick={() => { onOpenAdmin(); setShowProfileMenu(false); }}
                    style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--primary)', fontWeight: '500' }}
                    className="menu-item-hover"
                  >
                    <Shield size={16} /> Admin Panel
                  </div>
                )}
                <div 
                  onClick={() => { toggleTheme(); setShowProfileMenu(false); }}
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: '500' }}
                  className="menu-item-hover"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </div>
                <div 
                  onClick={() => { setShowSettingsModal(true); setShowProfileMenu(false); }}
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: '500' }}
                  className="menu-item-hover"
                >
                  <Settings size={16} /> Settings
                </div>
                <div 
                  onClick={() => { setShowGroupModal(true); setShowProfileMenu(false); }}
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: 'var(--text-main)', fontWeight: '500' }}
                  className="menu-item-hover"
                >
                  <Users size={16} /> Create Group
                </div>
                <div 
                  onClick={() => { onLogout(); setShowProfileMenu(false); }}
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', color: '#ff5252', fontWeight: '500' }}
                  className="menu-item-hover"
                >
                  <LogOut size={16} /> Logout
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
        <button
          onClick={() => setActiveTab('chats')}
          style={{
            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
            color: activeTab === 'chats' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'chats' ? '600' : '500',
            borderBottom: activeTab === 'chats' ? '2px solid var(--primary)' : '2px solid transparent',
            cursor: 'pointer', fontSize: '14px', transition: '0.2s'
          }}
        >
          Chats
        </button>
        <button
          onClick={() => setActiveTab('friends')}
          style={{
            flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
            color: activeTab === 'friends' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'friends' ? '600' : '500',
            borderBottom: activeTab === 'friends' ? '2px solid var(--primary)' : '2px solid transparent',
            cursor: 'pointer', fontSize: '14px', transition: '0.2s'
          }}
        >
          Friends
        </button>
      </div>

      {/* Search and Start Chat */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 38px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-main)',
              fontSize: '16px', // 16px prevents iOS Safari auto-zoom on focus
              outline: 'none'
            }}
          />
        </div>

        {/* User Search Results */}
        {searchQuery.trim() !== '' && (
          <div className="glass-panel animate-pop-in" style={{
            position: 'absolute',
            top: '56px',
            left: '16px',
            right: '16px',
            borderRadius: '12px',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 10,
            background: 'var(--bg-sidebar)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)'
          }}>
            {isSearching && searchResults.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Searching...</div>
            ) : searchResults.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>No users found</div>
            ) : (
              searchResults.map(searchedUser => (
                <div
                  key={searchedUser.id}
                  onClick={() => handleSelectUser(searchedUser)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-color)',
                    transition: 'background 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <img src={searchedUser.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {searchedUser.display_name}
                      {searchedUser.is_verified === 1 && (
                        <BadgeCheck size={14} color="#009688" fill="#e0f2f1" />
                      )}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{searchedUser.username}</span>
                  </div>
                  <button 
                    onClick={(e) => handleSendFriendRequestFromSearch(e, searchedUser.id)}
                    title="Add Friend"
                    style={{ 
                      marginLeft: 'auto', background: 'rgba(0,191,165,0.1)', border: '1px solid rgba(0,191,165,0.2)', 
                      padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: '0.2s' 
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,191,165,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,191,165,0.1)'}
                  >
                    <UserPlus size={16} color="var(--primary)" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Active Chats List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'chats' ? (
          chats.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              <div style={{ marginBottom: '12px', opacity: 0.5 }}><Search size={32} style={{ margin: '0 auto' }} /></div>
              Search users above to start messaging!
            </div>
          ) : (
            [...chats].sort((a, b) => {
              const aPinned = user?.pinned_chats?.includes(`${a.chat_type}_${a.id}`) ? 1 : 0;
              const bPinned = user?.pinned_chats?.includes(`${b.chat_type}_${b.id}`) ? 1 : 0;
              if (aPinned !== bPinned) return bPinned - aPinned;
              return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
            }).map(chat => {
            const isActive = activeChat && activeChat.id === chat.id && activeChat.chat_type === chat.chat_type;
            const isPinned = user?.pinned_chats?.includes(`${chat.chat_type}_${chat.id}`);
            
            // Check typing status
            const typingInfo = typingUsers.find(t => 
              t.chat_type === chat.chat_type && 
              (chat.chat_type === 'private' ? t.sender_id === chat.id : t.group_id === chat.id)
            );

            // Chat.id for private chats is the other user's ID
            const isOnline = chat.chat_type === 'private' && onlineUsers?.includes(chat.id);

            return (
              <div
                key={`${chat.chat_type}-${chat.id}`}
                onClick={() => onChatSelect(chat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color)',
                  background: isActive ? 'rgba(0, 191, 165, 0.15)' : 'transparent',
                  borderLeft: isActive ? '4px solid var(--primary)' : '4px solid transparent',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* Avatar and status bubble */}
                <div style={{ position: 'relative' }}>
                  <img
                    src={chat.avatar_url}
                    alt=""
                    style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                  {chat.chat_type === 'private' && chat.online && (
                    <div style={{
                      position: 'absolute',
                      width: '12px',
                      height: '12px',
                      background: '#00e676',
                      borderRadius: '50%',
                      border: '2px solid var(--bg-sidebar)',
                      bottom: '2px',
                      right: '2px'
                    }}></div>
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: 1 }}>
                      <h3 style={{
                        fontSize: '15px',
                        fontWeight: '600',
                        color: 'var(--text-main)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        margin: 0,
                        flex: 1
                      }}>
                        {chat.name}
                      </h3>
                      {chat.is_verified === 1 && (
                        <BadgeCheck size={16} color="#009688" fill="#e0f2f1" style={{ flexShrink: 0 }} />
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatTime(chat.last_message?.created_at || chat.updated_at)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    
                    {/* Last message snippet or typing */}
                    {typingInfo ? (
                      <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: '500' }}>
                        typing...
                      </span>
                    ) : chat.last_message ? (
                      <div style={{
                        fontSize: '13px',
                        color: chat.unread_count > 0 ? 'var(--text-main)' : 'var(--text-muted)',
                        fontWeight: chat.unread_count > 0 ? '600' : '400',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                        paddingRight: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {chat.last_message.sender_id === user.id && (
                          chat.last_message.status === 'read' ? <CheckCheck size={14} color="#34B7F1" /> :
                          chat.last_message.status === 'delivered' ? <CheckCheck size={14} color="var(--text-muted)" /> :
                          <Check size={14} color="var(--text-muted)" />
                        )}
                        <span>{chat.last_message.sender_id === user.id ? 'You: ' : (chat.chat_type === 'group' ? `${chat.last_message.sender_name}: ` : '')}</span>
                        <span>{chat.last_message.message_type === 'image' ? '📷 Photo' : chat.last_message.content}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No messages yet
                      </span>
                    )}

                    {/* Unread badge */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {isPinned && <Pin size={12} color="var(--primary)" style={{ transform: 'rotate(45deg)' }} />}
                        {chat.unread_count > 0 && (
                          <div className="animate-pop-in" style={{
                            background: 'var(--primary)', color: '#000', fontSize: '11px', fontWeight: '700',
                            minWidth: '18px', height: '18px', borderRadius: '9px', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                            boxShadow: '0 2px 6px rgba(0,191,165,0.4)'
                          }}>
                            {chat.unread_count > 99 ? '99+' : chat.unread_count}
                          </div>
                        )}
                      </div>
                    </div>
                    <button 
                      className="delete-chat-btn" 
                      onClick={(e) => handleDeleteChat(e, chat.chat_type, chat.id)} 
                      title={chat.chat_type === 'group' ? 'Leave Group' : 'Delete Chat'}
                      style={{ 
                        background: 'none', border: 'none', color: 'var(--text-muted)', 
                        cursor: 'pointer', padding: '4px', opacity: 0.5, display: 'flex', marginLeft: '8px', transition: '0.2s' 
                      }} 
                      onMouseEnter={e => { e.currentTarget.style.opacity=1; e.currentTarget.style.color='#ff5252'; }} 
                      onMouseLeave={e => { e.currentTarget.style.opacity=0.5; e.currentTarget.style.color='var(--text-muted)'; }}
                    >
                       <Trash2 size={16} />
                    </button>

                  </div>
                </div>
              </div>
            );
          })
        )
      ) : (
        /* --- FRIENDS TAB CONTENT --- */
        <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          
          {/* Pending Incoming Requests */}
          {friendsData.pendingIncoming.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
                Friend Requests ({friendsData.pendingIncoming.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {friendsData.pendingIncoming.map(req => (
                  <div key={`req-${req.request_id}`} className="glass-panel" style={{ padding: '12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src={req.avatar_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.display_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>@{req.username}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => handleFriendAction('accept', req.request_id)} style={{ background: 'rgba(0,230,118,0.2)', color: '#00e676', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Check size={16} /></button>
                      <button onClick={() => handleFriendAction('reject', req.request_id)} style={{ background: 'rgba(255,82,82,0.2)', color: '#ff5252', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Outgoing Requests */}
          {friendsData.pendingOutgoing.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
                Sent Requests ({friendsData.pendingOutgoing.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {friendsData.pendingOutgoing.map(req => (
                  <div key={`out-${req.request_id}`} style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.7 }}>
                    <img src={req.avatar_url} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-main)' }}>{req.display_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pending</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends List */}
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
              All Friends ({friendsData.friends.length})
            </h4>
            {friendsData.friends.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No friends yet. Search for users to add them!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {friendsData.friends.map(friend => {
                  const isOnline = onlineUsers?.includes(friend.id);
                  return (
                    <div
                      key={`friend-${friend.id}`}
                      onClick={() => {
                        onChatSelect({ id: friend.id, chat_type: 'private', name: friend.display_name, display_name: friend.display_name, avatar_url: friend.avatar_url });
                        setActiveTab('chats');
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', cursor: 'pointer',
                        borderRadius: '8px', transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ position: 'relative' }}>
                        <img src={friend.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                        {isOnline && (
                          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', borderRadius: '50%', background: '#00e676', border: '2px solid var(--bg-sidebar)' }} />
                        )}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>
                          {friend.display_name}
                          {friend.is_verified === 1 && <CheckCircle size={14} color="#1DA1F2" style={{ marginLeft: '4px', verticalAlign: 'middle' }} />}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>@{friend.username}</div>
                      </div>

                      <button 
                        onClick={(e) => handleRemoveFriend(e, friend.id)} 
                        title="Remove Friend"
                        style={{ 
                          background: 'none', border: 'none', color: 'var(--text-muted)', 
                          cursor: 'pointer', padding: '4px', opacity: 0.5, display: 'flex', transition: '0.2s' 
                        }} 
                        onMouseEnter={e => { e.currentTarget.style.opacity=1; e.currentTarget.style.color='#ff5252'; }} 
                        onMouseLeave={e => { e.currentTarget.style.opacity=0.5; e.currentTarget.style.color='var(--text-muted)'; }}
                      >
                         <Trash2 size={16} />
                      </button>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
      </div>

      {/* --- CREATE GROUP MODAL --- */}
      {showGroupModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel animate-pop-in" style={{
            width: '90%',
            maxWidth: '400px',
            borderRadius: '28px', // rounder corners
            padding: '24px',
            boxShadow: 'var(--glass-shadow)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700' }}>Create New Group</h2>
              <button
                onClick={() => {
                  setShowGroupModal(false);
                  setGroupName('');
                  setSelectedGroupMembers([]);
                  setGroupAvatarPreview(null);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateGroupSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Group Avatar input */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                <div 
                  style={{ position: 'relative', cursor: 'pointer' }}
                  onClick={() => groupAvatarInputRef.current?.click()}
                  title="Upload Group Picture"
                >
                  <img 
                    src={groupAvatarPreview || `https://ui-avatars.com/api/?name=Group&background=009688&color=fff&size=80`} 
                    alt="Group Avatar" 
                    style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} 
                  />
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0, background: 'var(--primary)', 
                    borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Plus size={14} color="#000" />
                  </div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={groupAvatarInputRef} 
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setGroupAvatarPreview(reader.result);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Group Name input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. Friends 🚀"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-main)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Selected members list */}
              {selectedGroupMembers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                  {selectedGroupMembers.map(member => (
                    <div key={member.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(0,191,165,0.2)',
                      border: '1px solid rgba(0,191,165,0.3)',
                      padding: '4px 8px',
                      borderRadius: '20px',
                      fontSize: '12px'
                    }}>
                      <span>{member.display_name}</span>
                      <button type="button" onClick={() => handleToggleMember(member)} style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        display: 'inline-flex'
                      }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add members search */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Add Members</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text-main)',
                      fontSize: '16px', // 16px prevents iOS Safari auto-zoom on focus
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Member Search Results list */}
                {groupSearchResults.length > 0 && (
                  <div style={{
                    maxHeight: '120px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    marginTop: '4px',
                    background: 'rgba(0,0,0,0.2)'
                  }}>
                    {groupSearchResults.map(sUser => {
                      const isSelected = selectedGroupMembers.some(m => m.id === sUser.id);
                      return (
                        <div
                          key={sUser.id}
                          onClick={() => handleToggleMember(sUser)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(0,191,165,0.08)' : 'transparent',
                            borderBottom: '1px solid var(--border-color)'
                          }}
                        >
                          <img src={sUser.avatar_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600' }}>{sUser.display_name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>@{sUser.username}</span>
                          </div>
                          {isSelected && <Check size={14} style={{ marginLeft: 'auto', color: 'var(--primary)' }} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Submit btn */}
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--primary) 0%, #00796b 100%)',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginTop: '8px',
                  boxShadow: '0 4px 12px rgba(0, 191, 165, 0.2)'
                }}
              >
                Create Group
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- SETTINGS MODAL --- */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel animate-pop-in" style={{
            width: '90%',
            maxWidth: '350px',
            borderRadius: '28px', // rounder corners
            padding: '24px',
            boxShadow: 'var(--glass-shadow)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Profile Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div 
              style={{ position: 'relative', cursor: 'pointer', marginBottom: '20px' }}
              onClick={() => avatarInputRef.current?.click()}
              title="Change Profile Picture"
            >
              <img 
                src={editAvatarBase64 || user.avatar_url} 
                alt="Profile" 
                style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} 
              />
              <div style={{
                position: 'absolute', bottom: 0, right: 0, background: 'var(--primary)', 
                borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Plus size={14} color="#000" />
              </div>
              <input 
                type="file" 
                accept="image/*" 
                ref={avatarInputRef} 
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setEditAvatarBase64(reader.result);
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </div>

            <div style={{ width: '100%', marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Display Name</label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Display Name"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-main)',
                  fontSize: '16px', // 16px prevents iOS Safari auto-zoom on focus
                  outline: 'none'
                }}
              />
            </div>

            <button
              onClick={async () => {
                try {
                  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
                  if (emojiRegex.test(editDisplayName)) {
                    return showToast('Emojis are not allowed in Display Name', 'error');
                  }

                  const payload = { display_name: editDisplayName };
                  
                  if (avatarInputRef.current?.files?.[0]) {
                    showToast('Uploading profile picture...', 'info');
                    payload.avatar_url = await uploadToImgBB(avatarInputRef.current.files[0]);
                  } else if (editAvatarBase64) {
                    payload.avatar_url = editAvatarBase64;
                  }
                  
                  const res = await fetch(`${serverUrl}/api/users/profile`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payload)
                  });
                  if (res.ok) {
                    const updatedUser = await res.json();
                    localStorage.setItem('zihanchat_user', JSON.stringify(updatedUser));
                    showToast('Profile updated successfully!', 'success');
                    setTimeout(() => window.location.reload(), 1000);
                  } else {
                    showToast('Failed to update profile', 'error');
                  }
                } catch(e) {
                  showToast(e.message, 'error');
                }
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary) 0%, #00796b 100%)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 191, 165, 0.2)'
              }}
            >
              Save Changes
            </button>

            {/* Change Password Section */}
            <div style={{ width: '100%', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Change Password</h3>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Current Password"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-main)', fontSize: '14px', outline: 'none', marginBottom: '10px'
                }}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New Password"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-main)', fontSize: '14px', outline: 'none', marginBottom: '12px'
                }}
              />
              <button
                onClick={async () => {
                  if (!oldPassword || !newPassword) {
                    return showToast('Please fill both password fields', 'error');
                  }
                  try {
                    const res = await fetch(`${serverUrl}/api/users/password`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({ oldPassword, newPassword })
                    });
                    const data = await res.json();
                    if (res.ok) {
                      showToast('Password changed successfully!', 'success');
                      setOldPassword('');
                      setNewPassword('');
                    } else {
                      showToast(data.error || 'Failed to change password', 'error');
                    }
                  } catch(e) {
                    showToast('Server error', 'error');
                  }
                }}
                style={{
                  width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-main)', fontSize: '14px', fontWeight: '600',
                  cursor: 'pointer', transition: '0.2s'
                }}
              >
                Update Password
              </button>
            </div>
            
            {/* Blue Tick Section */}
            <div style={{ width: '100%', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BadgeCheck size={18} color="#009688" fill="#e0f2f1" />
                Verified Badge
              </div>
              
              {user.is_verified === 1 ? (
                <div style={{ fontSize: '13px', color: 'var(--primary)', background: 'rgba(0,191,165,0.1)', padding: '10px', borderRadius: '8px' }}>
                  You are a verified user!
                  {user.verified_until && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Expires on: {new Date(user.verified_until).toLocaleString()}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <select 
                    value={blueTickDuration}
                    onChange={(e) => setBlueTickDuration(e.target.value)}
                    style={{
                      padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)',
                      background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', outline: 'none'
                    }}
                  >
                    <option value="24">24 Hours (1 Day)</option>
                    <option value="48">48 Hours (2 Days)</option>
                    <option value="168">168 Hours (7 Days)</option>
                    <option value="720">720 Hours (1 Month)</option>
                    <option value="2160">2160 Hours (3 Months)</option>
                    <option value="4320">4320 Hours (6 Months)</option>
                    <option value="8760">8760 Hours (1 Year)</option>
                  </select>
                  <button
                    onClick={handleRequestBlueTick}
                    style={{
                      background: 'rgba(0,191,165,0.1)', border: '1px solid rgba(0,191,165,0.3)',
                      color: 'var(--primary)', padding: '8px', borderRadius: '8px', cursor: 'pointer',
                      fontWeight: '600', fontSize: '13px'
                    }}
                  >
                    Request Blue Tick
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
