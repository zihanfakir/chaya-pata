import React, { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon, MoreVertical, UserPlus, X, Check, CheckCheck, Smile, Trash2, BadgeCheck, Copy, Reply, Shield, Pin, Settings } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

export default function ChatWindow({
  activeChat,
  messages,
  user,
  onSendMessage,
  onDeleteMessage,
  onDeleteChat,
  onUnfriend,
  onPinChat,
  onBack,
  serverUrl,
  token,
  socket,
  typingUsers,
  showToast,
  showConfirm
}) {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [groupSettingsName, setGroupSettingsName] = useState('');
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [showMembersDropdown, setShowMembersDropdown] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [friendStatus, setFriendStatus] = useState('none'); // 'none', 'friends', 'request_sent', 'request_received'

  // New Feature States
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [swipeState, setSwipeState] = useState({ msgId: null, startX: 0, currentX: 0 });
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isBlockedByThem, setIsBlockedByThem] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Emit mark_read when chat is opened or new messages arrive
  useEffect(() => {
    if (activeChat && socket && messages.length > 0) {
      const hasUnread = messages.some(m => m.sender_id !== user.id && m.is_read !== 1);
      if (hasUnread) {
        socket.emit('mark_read', { chat_type: activeChat.chat_type, target_id: activeChat.id });
      }
    }
  }, [messages, activeChat, socket, user.id]);

  // Fetch group members if active chat is a group, or friend status if private
  useEffect(() => {
    if (activeChat) {
      if (activeChat.chat_type === 'group') {
        fetchGroupMembers();
      } else if (activeChat.chat_type === 'private') {
        fetchFriendStatus();
        fetchBlockStatus();
      }
    } else {
      setGroupMembers([]);
      setFriendStatus('none');
      setIsBlockedByMe(false);
      setIsBlockedByThem(false);
    }
    setShowMembersDropdown(false);
  }, [activeChat]);

  const fetchBlockStatus = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/users/block/status/${activeChat.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsBlockedByMe(data.blockedByMe);
        setIsBlockedByThem(data.blockedByThem);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFriendStatus = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/friends/status/${activeChat.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFriendStatus(data.status);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendFriendRequest = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/friends/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ targetId: activeChat.id })
      });
      if (res.ok) {
        showToast('Friend request sent!', 'success');
        setFriendStatus('request_sent');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to send request', 'error');
      }
    } catch (err) {
      showToast('Server error', 'error');
    }
  };

  const fetchGroupMembers = async () => {
    if (!activeChat || activeChat.chat_type !== 'group') return;
    try {
      const res = await fetch(`${serverUrl}/api/groups/${activeChat.id}/members`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroupMembers(data);
      }
    } catch (err) {
      console.error('Error fetching group members:', err);
    }
  };

  useEffect(() => {
    if (showGroupSettingsModal && activeChat) {
      setGroupSettingsName(activeChat.name);
    }
  }, [showGroupSettingsModal, activeChat]);

  // Handle text typing indicator
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (!socket) return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing', {
        chat_type: activeChat.chat_type,
        target_id: activeChat.id,
        typing: true
      });
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (socket && activeChat) {
        socket.emit('typing', {
          chat_type: activeChat.chat_type,
          target_id: activeChat.id,
          typing: false
        });
      }
    }, 2000);
  };

  // Submit Text Message
  const handleSendSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim(), 'text', null, replyingTo?.id);
      setInputText('');
      setReplyingTo(null);
      setShowEmojiPicker(false);
      socket?.emit('typing', { chat_type: activeChat.chat_type, target_id: activeChat.id, typing: false });
      setIsTyping(false);
    }
  };

  const onEmojiClick = (emojiObject) => {
    setInputText(prev => prev + emojiObject.emoji);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be less than 5MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64Image = ev.target.result;
      onSendMessage('', 'image', base64Image, replyingTo?.id);
      setReplyingTo(null);
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // reset
  };

  const handleReact = (messageId, emoji) => {
    if (!socket || !activeChat) return;
    socket.emit('react_message', {
      message_id: messageId,
      emoji: emoji,
      chat_type: activeChat.chat_type,
      target_id: activeChat.id
    });
    setHoveredMsgId(null);
  };

  // Add Member to Group
  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    if (!newMemberUsername.trim()) return;

    try {
      if (activeChat.chat_type === 'group') {
        setGroupSettingsName(activeChat.name);
        const response = await fetch(`${serverUrl}/api/groups/${activeChat.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ username: newMemberUsername.trim() })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to add member');

        showToast(`${newMemberUsername} added to the group!`, 'success');
        setShowAddMemberModal(false);
        setNewMemberUsername('');
        fetchGroupMembers();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };


  // Format timestamp for message bubbles
  const formatMsgTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageStatus = (msg) => {
    if (msg.sender_id !== user.id) return null;
    
    // Improved contrast for teal bubbles
    if (msg.status === 'read') return <CheckCheck size={15} color="#0038FF" style={{ marginLeft: '4px', filter: 'drop-shadow(0px 1px 1px rgba(255,255,255,0.3))' }} />;
    if (msg.status === 'delivered') return <CheckCheck size={14} color="rgba(255, 255, 255, 0.75)" style={{ marginLeft: '4px' }} />;
    return <Check size={14} color="rgba(255, 255, 255, 0.75)" style={{ marginLeft: '4px' }} />;
  };

  const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '👏'];

  const renderMessage = (msg, index) => {
    const isMine = msg.sender_id === user.id;
    const showSenderName = !isMine && activeChat.chat_type === 'group';

    // Check if the previous message was from the same sender to group bubbles
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const isConsecutive = prevMsg && prevMsg.sender_id === msg.sender_id;

    // Swipe Logic
    const isSwiping = swipeState.msgId === msg.id;
    const swipeDiff = isSwiping ? swipeState.currentX - swipeState.startX : 0;
    // Allow swipe right for reply (max 60px)
    const translateX = isSwiping && swipeDiff > 0 ? Math.min(swipeDiff, 60) : 0;

    return (
      <div 
        key={msg.id} 
        id={`msg-${msg.id}`}
        onMouseEnter={() => setHoveredMsgId(msg.id)}
        onMouseLeave={() => setHoveredMsgId(null)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMine ? 'flex-end' : 'flex-start',
          marginBottom: isConsecutive ? '4px' : '16px',
          position: 'relative'
        }}
      >
        {/* Swipe Icon Indicator (Reply Icon) */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '12px',
          transform: `translateY(-50%) scale(${translateX / 60})`,
          opacity: translateX / 60,
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '50%',
          padding: '6px',
          display: 'flex',
          pointerEvents: 'none',
          transition: isSwiping ? 'none' : 'all 0.2s ease-out'
        }}>
          <Reply size={20} color="var(--primary)" />
        </div>

        <div 
          onTouchStart={(e) => setSwipeState({ msgId: msg.id, startX: e.touches[0].clientX, currentX: e.touches[0].clientX })}
          onTouchMove={(e) => {
            if (swipeState.msgId === msg.id) {
              setSwipeState(prev => ({ ...prev, currentX: e.touches[0].clientX }));
            }
          }}
          onTouchEnd={() => {
            if (swipeState.msgId === msg.id) {
              if (swipeState.currentX - swipeState.startX >= 50) {
                setReplyingTo(msg);
                document.querySelector('input[type="text"]')?.focus();
                if (navigator.vibrate) navigator.vibrate(50);
              }
              setSwipeState({ msgId: null, startX: 0, currentX: 0 });
            }
          }}
          style={{
          display: 'flex',
          flexDirection: isMine ? 'row-reverse' : 'row',
          alignItems: 'flex-start',
          gap: '8px',
          maxWidth: '75%',
          position: 'relative',
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s ease-out',
          zIndex: 2
        }}>
          <div style={{
            background: isMine ? 'var(--primary)' : 'var(--bg-secondary)',
            color: isMine ? '#fff' : 'var(--text-main)',
            padding: '8px 12px',
            borderRadius: isConsecutive 
              ? '8px'
              : (isMine ? '16px 4px 16px 16px' : '4px 16px 16px 16px'),
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            position: 'relative',
            minWidth: '80px',
            wordBreak: 'break-word'
          }}>
            {showSenderName && !isConsecutive && (
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary-light)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {msg.sender_name}
                {msg.sender_is_verified === 1 && <BadgeCheck size={12} color="#009688" />}
              </div>
            )}
            
            {msg.reply_to_id && (
              <div 
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  borderLeft: `4px solid ${isMine ? '#fff' : 'var(--primary)'}`,
                  padding: '4px 8px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  fontSize: '12px',
                  opacity: 0.8,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  const element = document.getElementById(`msg-${msg.reply_to_id}`);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.style.background = 'rgba(255,255,255,0.2)';
                    setTimeout(() => { element.style.background = 'transparent'; }, 1000);
                  }
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                  {messages.find(m => m.id === msg.reply_to_id)?.sender_id === user.id ? 'You' : messages.find(m => m.id === msg.reply_to_id)?.sender_name || 'Someone'}
                </div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                  {messages.find(m => m.id === msg.reply_to_id)?.message_type === 'image' ? '📷 Photo' : messages.find(m => m.id === msg.reply_to_id)?.content || 'Message unavailable'}
                </div>
              </div>
            )}
            
            {msg.image_url && (
              <img 
                src={msg.image_url} 
                alt="Shared image" 
                style={{ 
                  width: '100%', maxWidth: '280px', maxHeight: '280px', objectFit: 'cover', 
                  borderRadius: '8px', marginBottom: msg.content ? '8px' : '0', cursor: 'pointer' 
                }}
                onClick={() => setLightboxImage(msg.image_url)}
              />
            )}

            <div style={{ fontSize: '15px', lineHeight: '1.4' }}>{msg.content}</div>
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '4px',
              marginTop: '4px',
              fontSize: '11px',
              color: isMine ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)'
            }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {renderMessageStatus(msg)}
            </div>
          </div>

          {/* Hover Actions: Delete & React */}
          {hoveredMsgId === msg.id && (
            <div style={{ 
              position: 'absolute', bottom: '100%', [isMine ? 'right' : 'left']: '0', zIndex: 20, paddingBottom: '4px' 
            }}>
              <div style={{
                display: 'flex', gap: '4px', background: 'var(--bg-sidebar)', borderRadius: '16px', 
                padding: '4px 8px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
              }}>
              {EMOJI_LIST.map(emoji => (
                <button 
                  key={emoji}
                  onClick={() => handleReact(msg.id, emoji)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '4px', transition: 'transform 0.1s' }}
                  onMouseEnter={(e) => e.target.style.transform = 'scale(1.2)'}
                  onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                >
                  {emoji}
                </button>
              ))}
              
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

              <button 
                title="Reply"
                onClick={() => {
                  setReplyingTo(msg);
                  setHoveredMsgId(null);
                  document.querySelector('input[type="text"]')?.focus();
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
              >
                <Reply size={16} />
              </button>

              <button 
                title="Copy Text"
                onClick={() => {
                  if (msg.content) navigator.clipboard.writeText(msg.content);
                  showToast('Message copied', 'success');
                  setHoveredMsgId(null);
                }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
              >
                <Copy size={16} />
              </button>

              {(isMine || user.is_admin === 1) && (
                <button 
                  onClick={() => onDeleteMessage(msg.id)}
                  title="Delete Message"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#ff5252' }}
                >
                  <Trash2 size={16} />
                </button>
              )}
              </div>
            </div>
          )}
        </div>

        {/* Render Reactions below the bubble */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{
            display: 'flex', gap: '2px', background: 'var(--bg-sidebar)', padding: '2px 6px', borderRadius: '12px',
            fontSize: '14px', marginTop: '-8px', zIndex: 1, border: '1px solid var(--border-color)', alignSelf: isMine ? 'flex-end' : 'flex-start',
            marginRight: isMine ? '10px' : '0', marginLeft: isMine ? '0' : '10px'
          }}>
            {Object.entries(msg.reactions).map(([uId, emoji]) => (
              <span key={uId} title={`User ${uId}`}>{emoji}</span>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- WELCOME SCREEN (When no chat is active) ---
  if (!activeChat) {
    return (
      <div className="chat-bg-pattern" style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-chat)',
        borderTopRightRadius: '16px',
        borderBottomRightRadius: '16px',
        padding: '24px',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '96px',
          height: '96px',
          marginBottom: '24px',
        }}>
          <img src="/logo.svg" alt="ছায়া.পাতা Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '24px' }} />
        </div>
        <h2 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '10px' }}>ছায়া.পাতা</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '420px', fontSize: '15px', lineHeight: '1.6' }}>
          Send and receive real-time messages instantly using simple username handles. 
          No phone number required. Configure connection settings in the Auth screen to connect other devices.
        </p>
        
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '40px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-color)',
          padding: '12px 24px',
          borderRadius: '30px',
          fontSize: '13px',
          color: 'var(--text-light)',
          alignItems: 'center'
        }}>
          <span className="pulse-indicator"></span>
          <span>Server status: Online (Connected to Zihan Code server)</span>
        </div>
      </div>
    );
  }

  const chatTypingUsers = typingUsers.filter(t => 
    t.chat_type === activeChat.chat_type && 
    (activeChat.chat_type === 'private' ? t.sender_id === activeChat.id : t.group_id === activeChat.id)
  );

  return (
    <div className="chat-bg-pattern" style={{
      flex: 1,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-chat)',
      borderTopRightRadius: '16px',
      borderBottomRightRadius: '16px',
      overflow: 'hidden',
      position: 'relative'
    }}>
      
      {/* Chat Window Header */}
      <div className="glass-panel" style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(0,0,0,0.1)',
        position: 'relative',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          
          <button 
            className="back-btn-mobile"
            onClick={onBack}
            style={{
              background: 'none', border: 'none', color: 'var(--primary)',
              cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>

          <img
            src={activeChat.avatar_url}
            alt=""
            style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '600', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeChat.name}</span>
              {activeChat.is_verified === 1 && <BadgeCheck size={16} color="#009688" style={{ flexShrink: 0 }} />}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {activeChat.chat_type === 'private' ? (
                activeChat.online ? <span style={{ color: '#00e676' }}>Online</span> : 'Offline'
              ) : (
                `${groupMembers.length} members`
              )}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        
        {activeChat.chat_type === 'private' && friendStatus === 'request_sent' && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
            Request Sent
          </div>
        )}

        {/* Group Actions moved to 3-dot menu */}

        {/* Chat Menu Options (Delete Chat, Unfriend, Leave Group) */}
        <div style={{ position: 'relative', marginLeft: '8px' }}>
          <button
            onClick={() => setShowChatMenu(!showChatMenu)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
              padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <MoreVertical size={20} />
          </button>
          
          {showChatMenu && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: '4px',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
              borderRadius: '8px', padding: '4px', minWidth: '150px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 100
            }}>
              {activeChat.chat_type === 'private' && friendStatus === 'friends' && (
                <button
                  onClick={() => {
                    setShowChatMenu(false);
                    showConfirm('Unfriend', 'Are you sure you want to remove this friend?', onUnfriend);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    padding: '8px 12px', background: 'none', border: 'none',
                    color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <X size={16} /> Unfriend
                </button>
              )}

              {activeChat.chat_type === 'group' && (
                <>
                  <button
                    onClick={() => { setShowChatMenu(false); setShowAddMemberModal(true); }}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                      color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px',
                      cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: '500', transition: '0.2s',
                      marginTop: '4px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,191,165,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <UserPlus size={16} /> Add Member
                  </button>
                  <button
                    onClick={() => { setShowChatMenu(false); setShowGroupSettingsModal(true); }}
                    style={{
                      width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                      color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px',
                      cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: '500', transition: '0.2s',
                      marginTop: '4px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Settings size={16} /> Group Settings
                  </button>
                </>
              )}


              {activeChat.chat_type === 'private' && friendStatus === 'none' && (
                <button
                  onClick={() => { setShowChatMenu(false); handleSendFriendRequest(); }}
                  style={{
                    width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                    color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px',
                    cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: '500', transition: '0.2s',
                    marginTop: '4px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,191,165,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <UserPlus size={16} /> Add Friend
                </button>
              )}

              <button
                onClick={() => { setShowChatMenu(false); onPinChat(); }}
                style={{
                  width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                  color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px',
                  cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: '500', transition: '0.2s',
                  marginTop: '4px'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Pin size={16} style={{ transform: user?.pinned_chats?.includes(`${activeChat.chat_type}_${activeChat.id}`) ? 'rotate(45deg)' : 'none' }} /> 
                {user?.pinned_chats?.includes(`${activeChat.chat_type}_${activeChat.id}`) ? 'Unpin Chat' : 'Pin Chat'}
              </button>

              {activeChat.chat_type === 'private' && (
                <button
                  onClick={() => {
                    setShowChatMenu(false);
                    if (isBlockedByMe) {
                      showConfirm('Unblock User', `Are you sure you want to unblock ${activeChat.name}?`, async () => {
                        try {
                          const res = await fetch(`${serverUrl}/api/users/block/${activeChat.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                          });
                          if (res.ok) {
                            showToast('User unblocked successfully', 'success');
                            setIsBlockedByMe(false);
                          } else {
                            const data = await res.json();
                            showToast(data.error || 'Failed to unblock user', 'error');
                          }
                        } catch (err) {
                          showToast('Server error', 'error');
                        }
                      });
                    } else {
                      showConfirm('Block User', `Are you sure you want to block ${activeChat.name}?`, async () => {
                        try {
                          const res = await fetch(`${serverUrl}/api/users/block`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ target_id: activeChat.id })
                          });
                          if (res.ok) {
                            showToast('User blocked successfully', 'success');
                            setIsBlockedByMe(true);
                          } else {
                            const data = await res.json();
                            showToast(data.error || 'Failed to block user', 'error');
                          }
                        } catch (err) {
                          showToast('Server error', 'error');
                        }
                      });
                    }
                  }}
                  style={{
                    width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                    color: isBlockedByMe ? 'var(--primary)' : '#ff5252', display: 'flex', alignItems: 'center', gap: '10px',
                    cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: '500', transition: '0.2s',
                    marginTop: '4px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isBlockedByMe ? 'rgba(0,191,165,0.1)' : 'rgba(255,82,82,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Shield size={16} /> {isBlockedByMe ? 'Unblock User' : 'Block User'}
                </button>
              )}

              <button
                onClick={() => { setShowChatMenu(false); onDeleteChat(); }}
                style={{
                  width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                  color: '#ff5252', display: 'flex', alignItems: 'center', gap: '10px',
                  cursor: 'pointer', borderRadius: '6px', fontSize: '14px', fontWeight: '500', transition: '0.2s',
                  marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,82,82,0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Trash2 size={16} /> {activeChat.chat_type === 'group' ? 'Leave Group' : 'Delete Chat'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages Pane */}
      <div style={{
        flex: 1,
        padding: '24px 28px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 1
      }}>
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px 24px',
            fontSize: '14px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            maxWidth: '300px'
          }}>
            Say hi to start the conversation! 👋
          </div>
        ) : (
          messages.map((msg, index) => renderMessage(msg, index))
        )}
        
        {/* Typing indicator */}
        {chatTypingUsers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', padding: '0 16px' }}>
            {chatTypingUsers.length === 1 
              ? `${activeChat.chat_type === 'private' ? activeChat.name : chatTypingUsers[0].sender_name} is typing`
              : `${chatTypingUsers.length} people are typing`}
            <div className="typing-dots" style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '10px' }}>
              <style>{`
                @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
                .typing-dots span { width: 4px; height: 4px; background: var(--text-muted); border-radius: 50%; display: inline-block; animation: bounce 1s infinite; }
                .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
                .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
              `}</style>
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ position: 'relative', width: '100%' }}>
        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '100%', left: '16px', zIndex: 100, marginBottom: '8px' }}>
            <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
          </div>
        )}
        
        {replyingTo && (
          <div style={{ 
            background: 'var(--bg-secondary)', 
            padding: '8px 16px', 
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderLeft: '4px solid var(--primary)'
          }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)' }}>
                Replying to {replyingTo.sender_id === user.id ? 'yourself' : replyingTo.sender_name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                {replyingTo.message_type === 'image' ? '📷 Photo' : replyingTo.content}
              </div>
            </div>
            <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        )}

        <form onSubmit={handleSendSubmit} style={{
          padding: '16px',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderTop: '1px solid var(--border-color)',
          backdropFilter: 'blur(10px)'
        }}>
          {/* Attachment Options */}
          <button
            type="button"
            disabled={isBlockedByMe || isBlockedByThem}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            style={{
              background: 'none',
              border: 'none',
              color: showEmojiPicker ? 'var(--primary)' : 'var(--text-muted)',
              cursor: (isBlockedByMe || isBlockedByThem) ? 'not-allowed' : 'pointer',
              padding: '8px',
              borderRadius: '50%',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => { if (!(isBlockedByMe || isBlockedByThem)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title="Emojis"
          >
            <Smile size={22} />
          </button>

          <button
            type="button"
            disabled={isBlockedByMe || isBlockedByThem}
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: (isBlockedByMe || isBlockedByThem) ? 'not-allowed' : 'pointer',
              padding: '8px',
              borderRadius: '50%',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => { if (!(isBlockedByMe || isBlockedByThem)) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            title="Send Image"
          >
            <ImageIcon size={22} />
          </button>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />

          {/* Text Input */}
          <input
            type="text"
            placeholder={
              isBlockedByMe 
                ? "You have blocked this user. Unblock to message." 
                : isBlockedByThem 
                  ? "User blocked you" 
                  : "Type a message..."
            }
            value={inputText}
            onChange={handleInputChange}
            disabled={isBlockedByMe || isBlockedByThem}
            maxLength={5000}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '24px',
              border: '1px solid var(--border-color)',
              background: (isBlockedByMe || isBlockedByThem) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
              color: 'var(--text-main)',
              fontSize: '16px', // 16px prevents iOS browser auto-zoom on focus
              outline: 'none',
              transition: 'all 0.2s',
              cursor: (isBlockedByMe || isBlockedByThem) ? 'not-allowed' : 'text'
            }}
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: inputText.trim() 
                ? 'linear-gradient(135deg, var(--primary) 0%, #00796b 100%)' 
                : 'rgba(255,255,255,0.05)',
              border: 'none',
              color: inputText.trim() ? '#fff' : 'var(--text-muted)',
              cursor: inputText.trim() ? 'pointer' : 'default',
              boxShadow: inputText.trim() ? '0 4px 10px rgba(0, 191, 165, 0.2)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      {/* --- ADD MEMBER TO GROUP MODAL --- */}
      {showAddMemberModal && (
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
            maxWidth: '380px',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: 'var(--glass-shadow)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>Add Member to Group</h2>
              <button
                onClick={() => {
                  setShowAddMemberModal(false);
                  setNewMemberUsername('');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Username</label>
                <input
                  type="text"
                  placeholder="e.g. zihan456"
                  value={newMemberUsername}
                  onChange={(e) => setNewMemberUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
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
                  marginTop: '8px'
                }}
              >
                Add User
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Group Settings Modal */}
      {showGroupSettingsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
          <div className="animate-pop-in" style={{
            background: 'var(--bg-secondary)', width: '90%', maxWidth: '400px',
            borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Group Settings</h3>
              <button onClick={() => setShowGroupSettingsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500' }}>Group Name</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={groupSettingsName}
                    onChange={(e) => setGroupSettingsName(e.target.value)}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '10px',
                      border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text-main)', fontSize: '14px', outline: 'none'
                    }}
                  />
                  {groupMembers.find(m => m.id === user.id)?.is_admin === 1 && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`${serverUrl}/api/groups/${activeChat.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ name: groupSettingsName })
                          });
                          if (res.ok) {
                            showToast('Group name updated', 'success');
                          }
                        } catch (e) {
                          showToast('Failed to update', 'error');
                        }
                      }}
                      style={{
                        padding: '10px 16px', borderRadius: '10px', border: 'none',
                        background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '600'
                      }}
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>

              <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', marginTop: '24px' }}>Members</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {groupMembers.map(member => (
                  <div key={member.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={member.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {member.display_name} 
                          {member.is_admin === 1 && <span style={{ fontSize: '10px', background: 'var(--primary)', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>Admin</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>@{member.username}</div>
                      </div>
                    </div>
                    {groupMembers.find(m => m.id === user.id)?.is_admin === 1 && member.id !== user.id && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`${serverUrl}/api/groups/${activeChat.id}/admins`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({ target_user_id: member.id, is_admin: member.is_admin === 1 ? 0 : 1 })
                            });
                            if (res.ok) {
                              const mbrRes = await fetch(`${serverUrl}/api/groups/${activeChat.id}/members`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                              });
                              if (mbrRes.ok) {
                                setGroupMembers(await mbrRes.json());
                              }
                            }
                          } catch (e) {
                            showToast('Failed to change admin status', 'error');
                          }
                        }}
                        style={{
                          background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)',
                          padding: '4px 8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                        }}
                      >
                        {member.is_admin === 1 ? 'Remove Admin' : 'Make Admin'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)',
            cursor: 'zoom-out'
          }}
        >
          <img 
            src={lightboxImage} 
            alt="Fullscreen view" 
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              objectFit: 'contain'
            }}
          />
          <button 
            onClick={(e) => { e.stopPropagation(); setLightboxImage(null); }}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

