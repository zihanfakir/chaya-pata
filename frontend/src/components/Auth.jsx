import React, { useState } from 'react';
import { MessageSquare, Shield, User, Lock, Edit3, Globe } from 'lucide-react';

export default function Auth({ serverUrl, setServerUrl, onAuthSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password || (isRegister && !displayName)) {
      setError('Please fill in all fields');
      return;
    }

    const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
    if (isRegister && emojiRegex.test(displayName)) {
      setError('Emojis are not allowed in Display Name');
      return;
    }

    setError('');
    setLoading(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const payload = isRegister 
      ? { username, password, display_name: displayName }
      : { username, password };

    try {
      const response = await fetch(`${serverUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      onAuthSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100%',
      padding: '20px',
      position: 'relative'
    }} className="chat-bg-pattern">
      
      {/* Background decoration circles */}
      <div style={{
        position: 'absolute',
        width: '300px',
        height: '300px',
        background: 'rgba(0, 191, 165, 0.15)',
        borderRadius: '50%',
        filter: 'blur(50px)',
        top: '15%',
        left: '20%',
        zIndex: 0
      }}></div>
      <div style={{
        position: 'absolute',
        width: '250px',
        height: '250px',
        background: 'rgba(0, 121, 107, 0.2)',
        borderRadius: '50%',
        filter: 'blur(50px)',
        bottom: '15%',
        right: '20%',
        zIndex: 0
      }}></div>

      <div className="glass-panel animate-fade-in-up" style={{
        width: '100%',
        maxWidth: '420px',
        borderRadius: '32px', // rounder corners
        padding: '36px',
        zIndex: 1,
        boxShadow: 'var(--glass-shadow)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            marginBottom: '16px'
          }}>
            <img src="/logo.svg" alt="ছায়া.পাতা Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '16px' }} />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '-0.5px' }}>
            ছায়া.পাতা
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            {isRegister ? 'Create an account to start chatting' : 'Sign in with your username'}
          </p>
        </div>

        {error && (
          <div className="animate-pop-in" style={{
            background: 'rgba(244, 67, 54, 0.1)',
            border: '1px solid rgba(244, 67, 54, 0.2)',
            color: '#ff5252',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '14px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Shield size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Display Name Input (Only on Register) */}
          {isRegister && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-light)' }}>Display Name</label>
              <div style={{ position: 'relative' }}>
                <Edit3 size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Zihan Fakir"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required={isRegister}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 42px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-main)',
                    fontSize: '16px', // 16px prevents iOS browser auto-zoom on focus
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          )}

          {/* Username Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-light)' }}>Username</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="zihanfakir"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 42px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-main)',
                  fontSize: '16px', // 16px prevents iOS browser auto-zoom on focus
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Password Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-light)' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 42px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-main)',
                  fontSize: '16px', // 16px prevents iOS browser auto-zoom on focus
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary) 0%, #00796b 100%)',
              color: '#fff',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              marginTop: '10px',
              boxShadow: '0 4px 12px rgba(0, 191, 165, 0.2)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {/* Toggle Mode */}
        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px' }}>
          <span style={{ color: 'var(--text-light)' }}>
            {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          </span>
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary)',
              fontWeight: '600',
              cursor: 'pointer',
              padding: '0 4px',
              fontSize: '14px'
            }}
          >
            {isRegister ? 'Sign In' : 'Register Now'}
          </button>
        </div>



      </div>
    </div>
  );
}
