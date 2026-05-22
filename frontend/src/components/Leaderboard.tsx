import React, { useState, useEffect } from 'react';
import { Award, ArrowLeft, Search, Music, Trophy, Star } from 'lucide-react';

interface HighScore {
  id: number;
  song_id: number;
  nick: string;
  score: number;
  verified: boolean;
  created_at: string;
  song_title?: string;
  song_artist?: string;
}

interface SongItem {
  id: number;
  title: string;
  artist: string;
  length: number;
  cover: string;
  duet?: string[];
}

interface LeaderboardProps {
  onBack: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ onBack }) => {
  const [globalScores, setGlobalScores] = useState<HighScore[]>([]);
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [selectedSong, setSelectedSong] = useState<number | null>(null);
  const [songScores, setSongScores] = useState<HighScore[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [loadingSong, setLoadingSong] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Global Scores & Songs
  useEffect(() => {
    fetch('/api/leaderboard')
      .then((res) => res.json())
      .then((data) => {
        setGlobalScores(data);
        setLoadingGlobal(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingGlobal(false);
      });

    fetch('/api/tracklist')
      .then((res) => res.json())
      .then((data) => {
        setSongs(data);
      })
      .catch((err) => {
        console.error(err);
      });
  }, []);

  // Fetch individual song scores when selectedSong changes
  useEffect(() => {
    if (selectedSong === null) {
      setSongScores([]);
      return;
    }

    setLoadingSong(true);
    fetch(`/api/songs/${selectedSong}/highscores`)
      .then((res) => res.json())
      .then((data) => {
        setSongScores(data);
        setLoadingSong(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingSong(false);
      });
  }, [selectedSong]);

  const filteredSongs = songs.filter((song) =>
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="leaderboard-container">
      {/* Header */}
      <header className="leaderboard-header">
        <button onClick={onBack} className="btn-back animate-hover">
          <ArrowLeft size={18} /> Back to Lobby
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginTop: '16px' }}>
          <Trophy className="glow-icon" size={32} style={{ color: '#fbbf24' }} />
          <h1>Hall of Fame</h1>
        </div>
        <p className="subtitle">Official, cryptographically verified high scores</p>
      </header>

      {/* Main Section layout */}
      <div className="leaderboard-main-grid">
        {/* Left Side: Global Top 50 */}
        <section className="glass-panel global-leaders">
          <h2>
            <Award size={20} style={{ color: '#fbbf24' }} /> Global Top Scores
          </h2>
          {loadingGlobal ? (
            <div className="spinner-container">
              <div className="spinner" />
              <p>Loading records...</p>
            </div>
          ) : globalScores.length === 0 ? (
            <p className="no-scores">No scores registered yet. Start singing to set one!</p>
          ) : (
            <div className="table-wrapper">
              <table className="styled-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Singer</th>
                    <th>Song</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {globalScores.map((score, index) => (
                    <tr key={score.id} className="score-row">
                      <td className="rank-cell">
                        {index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </td>
                      <td className="singer-name">{score.nick}</td>
                      <td className="song-details">
                        <div className="title">{score.song_title || 'Unknown'}</div>
                        <div className="artist">{score.song_artist || 'Unknown'}</div>
                      </td>
                      <td className="score-value">{score.score.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Side: Song Specific Leaderboard Selector */}
        <section className="glass-panel song-search-leaderboard">
          <h2>
            <Music size={20} style={{ color: '#c084fc' }} /> Scores by Song
          </h2>

          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search songs or artists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="styled-input"
            />
          </div>

          <div className="song-selector-list">
            {filteredSongs.map((song) => (
              <button
                key={song.id}
                onClick={() => setSelectedSong(song.id)}
                className={`song-select-btn ${selectedSong === song.id ? 'active' : ''}`}
              >
                <img
                  src={`https://music.ponytone.online/${song.id}/${song.cover || 'cover.png'}`}
                  alt=""
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.onerror = null;
                    img.src = '/favicon.svg';
                  }}
                  className="song-thumbnail"
                />
                <div className="song-info">
                  <div className="title">{song.title}</div>
                  <div className="artist">{song.artist}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Song specific table */}
          <div className="song-scores-section">
            {selectedSong === null ? (
              <div className="prompt-select-song">
                <Music size={40} style={{ opacity: 0.2, marginBottom: '8px' }} />
                <p>Select a song from the list to view its top scores</p>
              </div>
            ) : loadingSong ? (
              <div className="spinner-container">
                <div className="spinner" />
                <p>Retrieving high scores...</p>
              </div>
            ) : (
              <div className="song-scores-list">
                <h3 className="selected-song-title">
                  Top 10 for {songs.find((s) => s.id === selectedSong)?.title}
                </h3>
                {songScores.length === 0 ? (
                  <p className="no-scores">No scores recorded for this song yet.</p>
                ) : (
                  <table className="styled-table compact">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Singer</th>
                        <th>Score</th>
                        <th>Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {songScores.map((score, index) => (
                        <tr key={score.id}>
                          <td>#{index + 1}</td>
                          <td className="singer-name">{score.nick}</td>
                          <td className="score-value">{score.score.toLocaleString()}</td>
                          <td>
                            {score.verified ? (
                              <span className="badge badge-verified"><Star size={12} fill="currentColor" /> Verified</span>
                            ) : (
                              <span className="badge badge-unverified">Unverified</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
