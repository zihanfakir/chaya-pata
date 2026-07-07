import React, { useState, useEffect } from 'react';
import { X, Check, XCircle, Shield, ShieldOff, CheckCircle, Search } from 'lucide-react';

export default function AdminPanel({ serverUrl, token, user, onClose, showToast, showConfirm }) {
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' or 'admins'
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tickModal, setTickModal] = useState({ show: false, mode: '', targetId: null, duration: 1, unit: 'days' });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all', 'owner', 'admin', 'user', 'verified', 'unverified'

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'requests') {
        const res = await fetch(`${serverUrl}/api/admin/verify/requests`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          setRequests(data);
        } else {
          showToast(data.error || 'Failed to fetch requests', 'error');
          setRequests([]);
        }
      } else {
        const res = await fetch(`${serverUrl}/api/admin/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
          setUsers(data);
        } else {
          showToast(data.error || 'Failed to fetch users', 'error');
          setUsers([]);
        }
      }
    } catch (err) {
      showToast('Failed to fetch data', 'error');
      setRequests([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (id) => {
    setTickModal({ show: true, mode: 'approve', targetId: id, duration: 1, unit: 'days' });
  };

  const submitTickModal = async () => {
    const { mode, targetId, duration, unit } = tickModal;
    
    let multiplier = 1;
    if (unit === 'hours') multiplier = 60;
    if (unit === 'days') multiplier = 1440;
    if (unit === 'months') multiplier = 43200;
    if (unit === 'years') multiplier = 525600;
    
    const totalMinutes = duration * multiplier;

    if (user.id !== 1 && totalMinutes > 1440) {
      showToast('Maximum duration is 1 day (24 hours)', 'error');
      return;
    }

    if (mode === 'approve') {
      try {
        const res = await fetch(`${serverUrl}/api/admin/verify/approve/${targetId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ customMinutes: totalMinutes })
        });
        if (res.ok) {
          showToast('Request approved!', 'success');
          fetchData();
        } else {
          showToast('Failed to approve request', 'error');
        }
      } catch (err) {
        showToast('Error approving request', 'error');
      }
    } else if (mode === 'give') {
      try {
        const res = await fetch(`${serverUrl}/api/admin/users/${targetId}/bluetick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'give', customMinutes: totalMinutes })
        });
        if (res.ok) {
          showToast('Blue tick granted successfully!', 'success');
          fetchData();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to update blue tick', 'error');
        }
      } catch (err) {
        showToast('Error updating blue tick', 'error');
      }
    }
    setTickModal({ show: false, mode: '', targetId: null, duration: 1, unit: 'days' });
  };

  const handleRejectRequest = async (id) => {
    try {
      const res = await fetch(`${serverUrl}/api/admin/verify/reject/${id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('Request Rejected', 'success');
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch (err) {
      showToast('Error rejecting request', 'error');
    }
  };

  const handleToggleAdmin = async (targetId, currentIsAdmin) => {
    if (targetId === user.id) {
      showToast('You cannot change your own admin status here', 'error');
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/api/admin/users/${targetId}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_admin: currentIsAdmin ? 0 : 1 })
      });
      if (res.ok) {
        showToast(currentIsAdmin ? 'Admin role removed' : 'Admin role granted', 'success');
        fetchData();
      } else {
        const err = await res.json();
        showToast(err.error, 'error');
      }
    } catch (err) {
      showToast('Error updating admin role', 'error');
    }
  };

  const handleUserBan = (id, isBanned) => {
    const action = isBanned ? 'unban' : 'ban';
    showConfirm(
      'Confirm Action',
      `Are you sure you want to ${action} this user?`,
      async () => {
        try {
          const res = await fetch(`${serverUrl}/api/admin/users/${id}/${action}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            showToast(`User ${action}ned successfully!`, 'success');
            fetchData();
          } else {
            const err = await res.json();
            showToast(err.error || 'Failed to update user', 'error');
          }
        } catch (err) {
          showToast('Error updating user status', 'error');
        }
      }
    );
  };

  const handleUserBlueTick = async (id, hasTick) => {
    if (!hasTick) {
      setTickModal({ show: true, mode: 'give', targetId: id, duration: 1, unit: 'days' });
      return;
    }

    showConfirm(
      'Remove Verification',
      'Are you sure you want to remove the blue tick from this user?',
      async () => {
        try {
          const res = await fetch(`${serverUrl}/api/admin/users/${id}/bluetick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'remove', customMinutes: 0 })
          });
          if (res.ok) {
            showToast('Blue tick removed successfully!', 'success');
            fetchData();
          } else {
            const err = await res.json();
            showToast(err.error || 'Failed to update blue tick', 'error');
          }
        } catch (err) {
          showToast('Error updating blue tick', 'error');
        }
      }
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-sidebar)',
        width: '90%',
        maxWidth: '600px',
        maxHeight: '80vh',
        borderRadius: '24px', // rounder corners
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield color="var(--primary)" size={24} /> Admin Panel
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'
          }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('requests')}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'requests' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'requests' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Blue Tick Requests
          </button>
          <button
            onClick={() => setActiveTab('admins')}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'admins' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'admins' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Manage Users & Admins
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
          ) : activeTab === 'requests' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {requests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No pending requests.</div>
              ) : (
                requests.map(req => (
                  <div key={req.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img src={req.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{req.display_name} (@{req.username})</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Requested {req.duration_hours} hours</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleApprove(req.id)} style={{
                        background: 'rgba(0,230,118,0.1)', color: '#00e676', border: '1px solid rgba(0,230,118,0.3)',
                        padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                      }}>
                        <Check size={16} /> Approve
                      </button>
                      <button onClick={() => handleRejectRequest(req.id)} style={{
                        background: 'rgba(244,67,54,0.1)', color: '#f44336', border: '1px solid rgba(244,67,54,0.3)',
                        padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                      }}>
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search users by name or username..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 38px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text-main)',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-main)',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all" style={{ color: '#000' }}>All Users</option>
                  <option value="owner" style={{ color: '#000' }}>Owners</option>
                  <option value="admin" style={{ color: '#000' }}>Admins</option>
                  <option value="user" style={{ color: '#000' }}>Regular Users</option>
                  <option value="verified" style={{ color: '#000' }}>Verified Users</option>
                  <option value="unverified" style={{ color: '#000' }}>Unverified Users</option>
                </select>
              </div>

              {users
                .filter(u => 
                  u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) || 
                  u.display_name.toLowerCase().includes(userSearchTerm.toLowerCase())
                )
                .filter(u => {
                  if (roleFilter === 'all') return true;
                  if (roleFilter === 'owner') return u.is_owner === 1;
                  if (roleFilter === 'admin') return u.is_admin === 1 && u.is_owner !== 1;
                  if (roleFilter === 'user') return u.is_admin !== 1 && u.is_owner !== 1;
                  if (roleFilter === 'verified') return u.is_verified === 1;
                  if (roleFilter === 'unverified') return u.is_verified !== 1;
                  return true;
                })
                .map(u => (
                <div key={u.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img src={u.avatar_url} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {u.display_name} (@{u.username})
                          {u.is_verified === 1 && <CheckCircle size={14} color="#009688" />}
                        </div>
                        <div style={{ fontSize: '12px', color: u.is_owner ? '#ff5252' : (u.is_admin ? 'var(--primary)' : 'var(--text-muted)') }}>
                          {u.is_owner ? 'Owner' : (u.is_admin ? 'Admin' : 'User')}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '12px' }}>
                    {u.id !== user.id && !u.is_owner && (
                      <>
                        <button onClick={() => handleToggleAdmin(u.id, u.is_admin)} style={{
                          background: u.is_admin ? 'rgba(255,152,0,0.1)' : 'rgba(0,191,165,0.1)',
                          color: u.is_admin ? '#ff9800' : 'var(--primary)',
                          border: `1px solid ${u.is_admin ? 'rgba(255,152,0,0.3)' : 'rgba(0,191,165,0.3)'}`,
                          padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px'
                        }}>
                          {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        
                        <button onClick={() => handleUserBan(u.id, u.is_banned === 1)} style={{
                          background: u.is_banned === 1 ? 'rgba(158,158,158,0.1)' : 'rgba(244,67,54,0.1)',
                          color: u.is_banned === 1 ? '#9e9e9e' : '#f44336',
                          border: `1px solid ${u.is_banned === 1 ? 'rgba(158,158,158,0.3)' : 'rgba(244,67,54,0.3)'}`,
                          padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px'
                        }}>
                          {u.is_banned === 1 ? 'Unban User' : 'Ban User'}
                        </button>

                        <button onClick={() => handleUserBlueTick(u.id, u.is_verified === 1)} style={{
                          background: u.is_verified === 1 ? 'rgba(244,67,54,0.1)' : 'rgba(0,230,118,0.1)',
                          color: u.is_verified === 1 ? '#f44336' : '#00e676',
                          border: `1px solid ${u.is_verified === 1 ? 'rgba(244,67,54,0.3)' : 'rgba(0,230,118,0.3)'}`,
                          padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px'
                        }}>
                          {u.is_verified === 1 ? 'Remove Tick' : 'Give Tick'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {tickModal.show && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'var(--bg-sidebar)', padding: '24px', borderRadius: '24px', // rounder corners
            width: '90%', maxWidth: '400px', border: '1px solid var(--border-color)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-main)', fontSize: '18px' }}>
              Set Blue Tick Duration
            </h3>
            
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <input 
                type="number" 
                min="1"
                value={tickModal.duration}
                onChange={e => setTickModal({...tickModal, duration: Number(e.target.value)})}
                style={{ 
                  flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', outline: 'none'
                }}
              />
              <select 
                value={tickModal.unit}
                onChange={e => setTickModal({...tickModal, unit: e.target.value})}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', outline: 'none'
                }}
              >
                <option value="minutes" style={{ color: '#000' }}>Minutes</option>
                <option value="hours" style={{ color: '#000' }}>Hours</option>
                <option value="days" style={{ color: '#000' }}>Days</option>
                {user.id === 1 && (
                  <>
                    <option value="months" style={{ color: '#000' }}>Months</option>
                    <option value="years" style={{ color: '#000' }}>Years</option>
                  </>
                )}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setTickModal({ show: false, mode: '', targetId: null, duration: 1, unit: 'minutes' })}
                style={{
                  padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)',
                  background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer'
                }}>
                Cancel
              </button>
              <button 
                onClick={submitTickModal}
                style={{
                  padding: '10px 16px', borderRadius: '8px', border: 'none',
                  background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: '500'
                }}>
                Confirm & Grant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
