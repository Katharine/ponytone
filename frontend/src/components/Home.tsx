import React, { useState, useEffect } from 'react';
import { Music, Play, Info, Award, ArrowRight } from 'lucide-react';

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
  onJoinParty: (partyId: string, nick: string) => void;
  onCreateParty: (nick: string) => void;
  onJoinAsMic: (partyId: string) => void;
  onGoToLeaderboard: () => void;
}

export const Home: React.FC<HomeProps> = ({
  onJoinParty,
  onCreateParty,
  onJoinAsMic,
  onGoToLeaderboard,
}) => {
  const [nick, setNick] = useState(() => localStorage.getItem('ponytone_nick') || '');
  const [partyId, setPartyId] = useState('');
  const [micPartyId, setMicPartyId] = useState('');
  const [recentScores, setRecentScores] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);

  // Save nickname to localStorage when changed
  useEffect(() => {
    localStorage.setItem('ponytone_nick', nick);
  }, [nick]);

  // Fetch leaderboard
  useEffect(() => {
    fetch('/api/leaderboard')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        setRecentScores(data);
        setLoadingLeaderboard(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingLeaderboard(false);
      });
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyId.trim()) return;
    if (!nick.trim()) {
      alert('Please enter a nickname first!');
      return;
    }
    onJoinParty(partyId.trim(), nick.trim());
  };

  const handleCreate = () => {
    if (!nick.trim()) {
      alert('Please enter a nickname first!');
      return;
    }
    onCreateParty(nick.trim());
  };

  const handleMicJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!micPartyId.trim()) return;
    onJoinAsMic(micPartyId.trim());
  };

  return (
    <div className="home-container">
      {/* Hero section */}
      <header className="hero-section">
        <div className="logo-glow" />
        <Music className="hero-icon" size={64} />
        <h1 className="hero-title">Ponytone</h1>
        <p className="hero-subtitle">Modernized Web Karaoke & Social Singing Game</p>
      </header>

      {/* Main dashboard grid */}
      <div className="dashboard-grid">
        {/* Left column: Setup & Play */}
        <section className="glass-panel main-controls">
          <h2>
            <Play size={20} /> Play Karaoke
          </h2>
          
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
            />
          </div>

          <div className="action-divider">Lobby Control</div>

          <div className="lobby-actions">
            <button
              onClick={handleCreate}
              disabled={!nick.trim()}
              className="btn btn-primary btn-full animate-hover"
            >
              Create New Room <ArrowRight size={18} />
            </button>

            <form onSubmit={handleJoin} className="join-form">
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

        {/* Right column: Connect phone mic */}
        <section className="glass-panel companion-mic-panel">
          <h2>
            <SmartphoneIcon size={20} /> Use Phone as Mic
          </h2>
          <p className="panel-desc">
            No professional microphone? No problem! Use your smartphone as a real-time pitch-detecting wireless microphone.
          </p>

          <form onSubmit={handleMicJoin} className="mic-join-form">
            <div className="input-group">
              <label htmlFor="mic-room">Room Code to Pair</label>
              <input
                id="mic-room"
                type="text"
                placeholder="E.g. aBcDeFgH"
                value={micPartyId}
                onChange={(e) => setMicPartyId(e.target.value)}
                maxLength={8}
                className="styled-input"
              />
            </div>
            <button
              type="submit"
              disabled={!micPartyId.trim()}
              className="btn btn-accent btn-full animate-hover"
            >
              Connect Phone Mic <ArrowRight size={18} />
            </button>
          </form>
        </section>
      </div>

      <div className="dashboard-grid second-row">
        {/* Global leaderboards */}
        <section className="glass-panel leaderboard-panel">
          <div className="panel-header">
            <h2>
              <Award size={20} /> Top Performances
            </h2>
            <button onClick={onGoToLeaderboard} className="btn-link animate-hover">
              View All
            </button>
          </div>

          {loadingLeaderboard ? (
            <div className="spinner-container">
              <div className="spinner" />
              <p>Loading high scores...</p>
            </div>
          ) : recentScores.length === 0 ? (
            <p className="no-scores">No verified high scores submitted yet. Be the first!</p>
          ) : (
            <div className="leaderboard-table-wrapper">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Singer</th>
                    <th>Song</th>
                    <th>Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentScores.slice(0, 5).map((score, idx) => (
                    <tr key={score.id} className="leaderboard-row">
                      <td className="rank-cell">#{idx + 1}</td>
                      <td className="singer-cell">{score.nick}</td>
                      <td className="song-cell">
                        <span className="song-title">{score.song_title || 'Unknown Song'}</span>
                        <span className="song-artist"> by {score.song_artist || 'Unknown Artist'}</span>
                      </td>
                      <td className="score-cell">{score.score.toLocaleString()}</td>
                      <td className="status-cell">
                        {score.verified ? (
                          <span className="badge badge-verified">Verified</span>
                        ) : (
                          <span className="badge badge-unverified">Unverified</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* FAQ & Information */}
        <section className="glass-panel info-panel">
          <h2>
            <Info size={20} /> How It Works
          </h2>
          <div className="faq-list">
            <details className="faq-item">
              <summary>What is Ponytone?</summary>
              <p>
                Ponytone is an online, interactive karaoke game based on UltraStar. You sing along with the notes shown on screen, and your microphone pitch is analyzed in real-time to score your accuracy!
              </p>
            </details>
            <details className="faq-item">
              <summary>How do I connect multiple mics?</summary>
              <p>
                Once you create a room, you can scan the QR code on the screen or open the pairing link on your phone. You can connect as many phones as you have singers, allowing everyone to sing their parts together.
              </p>
            </details>
            <details className="faq-item">
              <summary>How are high scores verified?</summary>
              <p>
                To prevent cheating, the game records your precise pitch detections during singing. When you finish, the Go backend downloads the official song sheets from S3, recalculates the score beat-by-beat, and marks verified scores in the leaderboards.
              </p>
            </details>
            <details className="faq-item">
              <summary>What is Tournament Mode?</summary>
              <p>
                Perfect for large groups! Tournament Mode enables more than 6 players to organize brackets, face off in singing battles, and stream voice channels in real-time.
              </p>
            </details>
          </div>
        </section>
      </div>

      <footer className="home-footer">
        <p>Ponytone Modernized Project &copy; {new Date().getFullYear()}. Crafted for social gaming.</p>
      </footer>
    </div>
  );
};

// Simple inline SVG helper for Smartphone (Lucide-react doesn't always support all names or versions)
const SmartphoneIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
    <path d="M12 18h.01" />
  </svg>
);
