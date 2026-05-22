import React, { useState, useEffect } from 'react';
import { Music, Monitor, Smartphone, Award, Info, ArrowRight, Users } from 'lucide-react';

interface LeaderboardEntry {
  id: number;
  song_id: number;
  nick: string;
  score: number;
  verified: boolean;
  created_at: string;
  song_title?: string;
  song_artist?: string;
}

interface HomeProps {
  onJoinParty: (partyId: string, nick: string, mode: 'computer' | 'con') => void;
  onCreateParty: (nick: string, mode: 'computer' | 'con') => void;
  onGoToLeaderboard: () => void;
}

type Screen = 'mode-select' | 'computer-setup' | 'con-setup';

export const Home: React.FC<HomeProps> = ({
  onJoinParty,
  onCreateParty,
  onGoToLeaderboard,
}) => {
  const [screen, setScreen] = useState<Screen>('mode-select');
  const [nick, setNick] = useState(() => localStorage.getItem('ponytone_nick') || '');
  const [partyId, setPartyId] = useState('');
  const [recentScores, setRecentScores] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

  useEffect(() => {
    localStorage.setItem('ponytone_nick', nick);
  }, [nick]);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((res) => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then((data) => { setRecentScores(data); setLoadingLeaderboard(false); })
      .catch(() => setLoadingLeaderboard(false));
  }, []);

  const handleComputerCreate = () => {
    if (!nick.trim()) { alert('Please enter a nickname first!'); return; }
    onCreateParty(nick.trim(), 'computer');
  };

  const handleComputerJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nick.trim()) { alert('Please enter a nickname first!'); return; }
    if (!partyId.trim()) return;
    onJoinParty(partyId.trim(), nick.trim(), 'computer');
  };

  const handleConCreate = () => {
    onCreateParty('Host', 'con');
  };

  const handleConJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyId.trim()) return;
    onJoinParty(partyId.trim(), 'Host', 'con');
  };

  return (
    <div className="home-container">
      {/* Hero */}
      <header className="hero-section">
        <div className="logo-glow" />
        <Music className="hero-icon" size={64} />
        <h1 className="hero-title">Ponytone</h1>
        <p className="hero-subtitle">Modernized Web Karaoke &amp; Social Singing Game</p>
      </header>

      {/* Mode selection */}
      {screen === 'mode-select' && (
        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '8px', fontSize: '20px', color: '#e4e4e7' }}>
            How are you playing today?
          </h2>
          <p style={{ textAlign: 'center', color: '#71717a', fontSize: '14px', marginBottom: '32px' }}>
            Choose your play style to get started.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Computer Mode */}
            <button
              onClick={() => setScreen('computer-setup')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '16px',
                padding: '28px 24px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(192,132,252,0.25)',
                borderRadius: '20px',
                cursor: 'pointer',
                color: '#fff',
                textAlign: 'left',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(192,132,252,0.12)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(192,132,252,0.5)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(192,132,252,0.25)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: 'linear-gradient(135deg, #c084fc, #6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Monitor size={26} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px' }}>
                  Computer Mode
                </div>
                <div style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: '1.6' }}>
                  Sing using your computer's microphone. You are an active player with your own score and chart line. Best for solo or small groups.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#c084fc', fontWeight: '600', marginTop: '4px' }}>
                Get Started <ArrowRight size={14} />
              </div>
            </button>

            {/* Con Mode */}
            <button
              onClick={() => setScreen('con-setup')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '16px',
                padding: '28px 24px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: '20px',
                cursor: 'pointer',
                color: '#fff',
                textAlign: 'left',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.12)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.5)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.25)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Users size={26} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '6px' }}>
                  Con Mode
                </div>
                <div style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: '1.6' }}>
                  The TV/host is just a display — all singers connect via their phones. Perfect for events, conventions, and large groups with phone mics.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#818cf8', fontWeight: '600', marginTop: '4px' }}>
                Get Started <ArrowRight size={14} />
              </div>
            </button>
          </div>

          {/* Leaderboard & FAQ below */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
            <section className="glass-panel leaderboard-panel">
              <div className="panel-header">
                <h2><Award size={20} /> Top Performances</h2>
                <button onClick={onGoToLeaderboard} className="btn-link animate-hover">View All</button>
              </div>
              {loadingLeaderboard ? (
                <div className="spinner-container"><div className="spinner" /><p>Loading...</p></div>
              ) : recentScores.length === 0 ? (
                <p className="no-scores">No verified scores yet. Be the first!</p>
              ) : (
                <div className="leaderboard-table-wrapper">
                  <table className="leaderboard-table">
                    <thead><tr><th>Rank</th><th>Singer</th><th>Song</th><th>Score</th></tr></thead>
                    <tbody>
                      {recentScores.slice(0, 5).map((score, idx) => (
                        <tr key={score.id} className="leaderboard-row">
                          <td className="rank-cell">#{idx + 1}</td>
                          <td className="singer-cell">{score.nick}</td>
                          <td className="song-cell">
                            <span className="song-title">{score.song_title || 'Unknown'}</span>
                          </td>
                          <td className="score-cell">{score.score.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="glass-panel info-panel">
              <h2><Info size={20} /> How It Works</h2>
              <div className="faq-list">
                <details className="faq-item">
                  <summary>Computer vs Con Mode?</summary>
                  <p>Computer Mode lets you sing from the host device with your mic. Con Mode turns the host screen into a pure display — everyone connects as a phone player with their own score.</p>
                </details>
                <details className="faq-item">
                  <summary>How do I connect phone mics?</summary>
                  <p>Once in the room, scan the QR code (or open the link) on your phone and choose "Join as New Player" or "Pair with existing singer."</p>
                </details>
                <details className="faq-item">
                  <summary>How are scores verified?</summary>
                  <p>Your pitch timings are recorded and re-scored server-side against the official song sheet after the song ends.</p>
                </details>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Computer Mode Setup */}
      {screen === 'computer-setup' && (
        <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
          <button
            onClick={() => { setScreen('mode-select'); setPartyId(''); }}
            style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0' }}
          >
            ← Back to mode selection
          </button>
          <section className="glass-panel main-controls">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Monitor size={20} style={{ color: '#c084fc' }} /> Computer Mode
            </h2>
            <p style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '20px', marginTop: '-4px' }}>
              You'll sing from this device with your computer microphone.
            </p>

            <div className="input-group">
              <label htmlFor="nickname">Your Nickname</label>
              <input
                id="nickname"
                type="text"
                placeholder="E.g. Rainbow Sing"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={20}
                className="styled-input"
                autoFocus
              />
            </div>

            <div className="action-divider">Lobby Control</div>

            <div className="lobby-actions">
              <button
                onClick={handleComputerCreate}
                disabled={!nick.trim()}
                className="btn btn-primary btn-full animate-hover"
              >
                Create New Room <ArrowRight size={18} />
              </button>

              <form onSubmit={handleComputerJoin} className="join-form">
                <input
                  type="text"
                  placeholder="Enter 8-char Room Code"
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  maxLength={8}
                  className="styled-input"
                />
                <button
                  type="submit"
                  disabled={!nick.trim() || !partyId.trim()}
                  className="btn btn-secondary animate-hover"
                >
                  Join
                </button>
              </form>
            </div>
          </section>
        </div>
      )}

      {/* Con Mode Setup */}
      {screen === 'con-setup' && (
        <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
          <button
            onClick={() => { setScreen('mode-select'); setPartyId(''); }}
            style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px', padding: '0' }}
          >
            ← Back to mode selection
          </button>
          <section className="glass-panel main-controls">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Users size={20} style={{ color: '#818cf8' }} /> Con Mode
            </h2>
            <p style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '20px', marginTop: '-4px' }}>
              The TV is a display only. All players connect via phone mics and appear on the scoreboard independently.
            </p>

            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px',
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: '12px', marginBottom: '20px', fontSize: '13px', color: '#c7d2fe',
              }}
            >
              <Smartphone size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>No nickname required — you'll share the room code and players connect with their phones.</span>
            </div>

            <div className="lobby-actions">
              <button
                onClick={handleConCreate}
                className="btn btn-primary btn-full animate-hover"
                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
              >
                Create Con Room <ArrowRight size={18} />
              </button>

              <form onSubmit={handleConJoin} className="join-form">
                <input
                  type="text"
                  placeholder="Enter 8-char Room Code"
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  maxLength={8}
                  className="styled-input"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!partyId.trim()}
                  className="btn btn-secondary animate-hover"
                >
                  Join
                </button>
              </form>
            </div>
          </section>
        </div>
      )}

      <footer className="home-footer">
        <p>Ponytone Modernized Project &copy; {new Date().getFullYear()}. Crafted for social gaming.</p>
      </footer>
    </div>
  );
};
