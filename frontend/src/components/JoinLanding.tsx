import React, { useState } from 'react';
import { Music, Monitor, Users, ArrowRight } from 'lucide-react';

interface JoinLandingProps {
  partyId: string;
  onJoin: (nick: string, mode: 'computer' | 'con') => void;
  onCancel: () => void;
}

export const JoinLanding: React.FC<JoinLandingProps> = ({
  partyId,
  onJoin,
  onCancel,
}) => {
  const [nick, setNick] = useState(() => localStorage.getItem('ponytone_nick') || '');
  const [mode, setMode] = useState<'computer' | 'con'>('computer');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'computer' && !nick.trim()) {
      alert('Please enter a nickname to join as a singer!');
      return;
    }
    const finalNick = mode === 'con' ? 'Host' : nick.trim();
    localStorage.setItem('ponytone_nick', finalNick);
    onJoin(finalNick, mode);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      boxSizing: 'border-box',
    }}>
      <header className="hero-section" style={{ marginBottom: '24px' }}>
        <div className="logo-glow" />
        <Music className="hero-icon" size={64} style={{ color: '#c084fc' }} />
        <h1 className="hero-title" style={{ fontSize: '40px', marginTop: '16px' }}>Join Ponytone Party</h1>
        <p className="hero-subtitle" style={{ fontSize: '15px' }}>
          You've been invited to join room <strong style={{ color: '#c084fc', textShadow: '0 0 10px rgba(192, 132, 252, 0.4)' }}>{partyId}</strong>
        </p>
      </header>

      <section className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '440px' }}>
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#a1a1aa' }}>Select Play Mode</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setMode('computer')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px',
                  background: mode === 'computer' ? 'rgba(192, 132, 252, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: mode === 'computer' ? '1px solid rgba(192, 132, 252, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  color: '#fff',
                  transition: 'all 0.2s',
                  boxShadow: mode === 'computer' ? '0 0 15px rgba(192, 132, 252, 0.15)' : 'none',
                }}
              >
                <Monitor size={22} color={mode === 'computer' ? '#c084fc' : '#a1a1aa'} />
                <span style={{ fontSize: '14px', fontWeight: '700' }}>Singing Player</span>
                <span style={{ fontSize: '11px', color: '#71717a', textAlign: 'center', lineHeight: '1.4' }}>Sing using computer mic</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('con')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px',
                  background: mode === 'con' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: mode === 'con' ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  color: '#fff',
                  transition: 'all 0.2s',
                  boxShadow: mode === 'con' ? '0 0 15px rgba(99, 102, 241, 0.15)' : 'none',
                }}
              >
                <Users size={22} color={mode === 'con' ? '#818cf8' : '#a1a1aa'} />
                <span style={{ fontSize: '14px', fontWeight: '700' }}>TV Display</span>
                <span style={{ fontSize: '11px', color: '#71717a', textAlign: 'center', lineHeight: '1.4' }}>Spectator / Host screen</span>
              </button>
            </div>
          </div>

          {mode === 'computer' ? (
            <div className="input-group">
              <label htmlFor="join-nick">Your Nickname</label>
              <input
                id="join-nick"
                type="text"
                placeholder="E.g. Rainbow Sing"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={20}
                className="styled-input"
                autoFocus
                required
              />
            </div>
          ) : (
            <div
              className="animate-fade-in"
              style={{
                padding: '12px 14px',
                background: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '12px',
                fontSize: '13px',
                color: '#c7d2fe',
                lineHeight: '1.5'
              }}
            >
              Joining as a non-playing TV display. Singers will pair their microphones separately using phones.
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary animate-hover"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary animate-hover"
              style={{
                flex: 2,
                justifyContent: 'center',
                background: mode === 'con' ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : undefined,
                border: mode === 'con' ? 'none' : undefined,
              }}
            >
              Join Room <ArrowRight size={16} style={{ marginLeft: '6px' }} />
            </button>
          </div>

        </form>
      </section>
    </div>
  );
};
