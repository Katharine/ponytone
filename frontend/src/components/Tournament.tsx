import React, { useState } from 'react';
import { Trophy, Users, Play, Plus, Trash2, Shuffle, Check } from 'lucide-react';

interface Match {
  id: string;
  p1: string;
  p2: string;
  score1?: number;
  score2?: number;
  winner?: string;
  round: number; // 0 = Quarterfinals, 1 = Semifinals, 2 = Finals
}

interface TournamentProps {
  initialPlayers?: string[];
  onStartMatch?: (player1: string, player2: string, callback: (s1: number, s2: number) => void) => void;
  onClose: () => void;
}

export const Tournament: React.FC<TournamentProps> = ({
  initialPlayers = [],
  onStartMatch,
  onClose,
}) => {
  const [playerList, setPlayerList] = useState<string[]>(initialPlayers);
  const [newPlayer, setNewPlayer] = useState('');
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentRound, setCurrentRound] = useState(0);

  const addPlayer = () => {
    if (!newPlayer.trim()) return;
    if (playerList.includes(newPlayer.trim())) {
      alert('Player name already exists!');
      return;
    }
    setPlayerList([...playerList, newPlayer.trim()]);
    setNewPlayer('');
  };

  const removePlayer = (idx: number) => {
    setPlayerList(playerList.filter((_, i) => i !== idx));
  };

  const shufflePlayers = () => {
    const list = [...playerList];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    setPlayerList(list);
  };

  const startTournament = () => {
    // We support 4 or 8 players for a neat bracket. If not power of 2, we pad with BYEs.
    let size = 4;
    if (playerList.length > 4) {
      size = 8;
    }

    if (playerList.length < 3) {
      alert('Need at least 3 players to start a tournament!');
      return;
    }

    const participants = [...playerList];
    while (participants.length < size) {
      participants.push('BYE');
    }

    // Generate initial round matches
    const initialMatches: Match[] = [];
    const matchCount = size / 2;
    for (let i = 0; i < matchCount; i++) {
      const p1 = participants[i * 2];
      const p2 = participants[i * 2 + 1];
      const hasBye = p1 === 'BYE' || p2 === 'BYE';
      initialMatches.push({
        id: `r0m${i}`,
        p1,
        p2,
        round: size === 8 ? 0 : 1, // Round 0 for QF (8 players), Round 1 for SF (4 players)
        winner: hasBye ? (p1 === 'BYE' ? p2 : p1) : undefined,
        score1: p2 === 'BYE' ? 10000 : undefined,
        score2: p1 === 'BYE' ? 10000 : undefined,
      });
    }

    setMatches(initialMatches);
    setCurrentRound(size === 8 ? 0 : 1);
    setTournamentStarted(true);
  };

  const runMatch = (match: Match) => {
    if (match.winner || match.p1 === 'BYE' || match.p2 === 'BYE') return;

    if (onStartMatch) {
      // Run match in parent PartyRoom (loads gameplay canvas for p1 and p2)
      onStartMatch(match.p1, match.p2, (score1, score2) => {
        const winner = score1 > score2 ? match.p1 : match.p2;
        updateMatchResult(match.id, score1, score2, winner);
      });
    } else {
      // Manual entry simulation if not connected to active room
      const s1 = Math.floor(Math.random() * 4000) + 6000;
      const s2 = Math.floor(Math.random() * 4000) + 6000;
      const winner = s1 > s2 ? match.p1 : match.p2;
      updateMatchResult(match.id, s1, s2, winner);
    }
  };

  const updateMatchResult = (id: string, s1: number, s2: number, winner: string) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          return { ...m, score1: s1, score2: s2, winner };
        }
        return m;
      })
    );
  };

  const advanceRound = () => {
    const activeRoundMatches = matches.filter((m) => m.round === currentRound);
    const incomplete = activeRoundMatches.some((m) => !m.winner);
    if (incomplete) {
      alert('Please complete all matches in this round first!');
      return;
    }

    const nextRound = currentRound + 1;
    if (nextRound > 2) {
      alert('Tournament is already finished!');
      return;
    }

    // Generate matches for next round based on winners
    const winners = activeRoundMatches.map((m) => m.winner!);
    const nextMatches: Match[] = [];
    const nextMatchCount = winners.length / 2;

    for (let i = 0; i < nextMatchCount; i++) {
      nextMatches.push({
        id: `r${nextRound}m${i}`,
        p1: winners[i * 2],
        p2: winners[i * 2 + 1],
        round: nextRound,
      });
    }

    setMatches([...matches, ...nextMatches]);
    setCurrentRound(nextRound);
  };

  const getWinnerOfTournament = () => {
    const finalMatch = matches.find((m) => m.round === 2);
    return finalMatch?.winner;
  };

  const getRoundName = (roundNum: number) => {
    if (roundNum === 0) return 'Quarterfinals';
    if (roundNum === 1) return 'Semifinals';
    return 'Finals';
  };

  return (
    <div className="tournament-overlay">
      <div className="tournament-content glass-panel">
        {/* Header */}
        <div className="tournament-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={28} style={{ color: '#fbbf24' }} />
            <h2 style={{ margin: 0 }}>Tournament Mode</h2>
          </div>
          <button onClick={onClose} className="btn-close">
            &times;
          </button>
        </div>

        {!tournamentStarted ? (
          /* SETUP MODE */
          <div className="setup-view">
            <p className="description">
              Set up a bracket tournament for your room. Add players and shuffle seeds.
            </p>

            <div className="setup-grid">
              {/* Left Column: Player Entry */}
              <div className="player-entry">
                <h3>Add Contestants</h3>
                <div className="entry-input-row">
                  <input
                    type="text"
                    placeholder="Contestant Name"
                    value={newPlayer}
                    onChange={(e) => setNewPlayer(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                    className="styled-input"
                  />
                  <button onClick={addPlayer} className="btn btn-secondary">
                    <Plus size={16} /> Add
                  </button>
                </div>

                <div className="player-list-scroll">
                  {playerList.length === 0 ? (
                    <p className="no-players">No contestants added. Add at least 3 players.</p>
                  ) : (
                    playerList.map((player, idx) => (
                      <div key={idx} className="player-pill">
                        <span>{player}</span>
                        <button onClick={() => removePlayer(idx)} className="btn-remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Actions & Options */}
              <div className="setup-actions">
                <div className="stat-card">
                  <Users size={32} style={{ color: '#c084fc', marginBottom: '8px' }} />
                  <span className="value">{playerList.length}</span>
                  <span className="label">Registered Singers</span>
                </div>

                <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: 'auto' }}>
                  <button onClick={shufflePlayers} className="btn btn-secondary btn-full">
                    <Shuffle size={16} /> Shuffle Seeds
                  </button>
                  <button
                    onClick={startTournament}
                    disabled={playerList.length < 3}
                    className="btn btn-primary btn-full"
                  >
                    <Play size={16} /> Generate Bracket
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* BRACKET VIEW */
          <div className="bracket-view">
            {/* Round headers */}
            <div className="round-tabs">
              {[0, 1, 2].map((r) => {
                // If 4-player tournament, Round 0 does not exist
                if (r === 0 && !matches.some((m) => m.round === 0)) return null;
                return (
                  <div
                    key={r}
                    className={`round-tab-header ${currentRound === r ? 'active' : ''}`}
                  >
                    {getRoundName(r)}
                  </div>
                );
              })}
            </div>

            {/* Brackets Draw Grid */}
            <div className="bracket-grid">
              {/* Quarterfinals */}
              {matches.some((m) => m.round === 0) && (
                <div className="bracket-column">
                  <h3>Quarterfinals</h3>
                  {matches
                    .filter((m) => m.round === 0)
                    .map((match) => (
                      <div key={match.id} className={`match-card ${match.winner ? 'complete' : ''}`}>
                        <div className={`participant-row ${match.winner === match.p1 ? 'winner' : ''}`}>
                          <span>{match.p1}</span>
                          <span className="score">{match.score1 !== undefined ? match.score1 : ''}</span>
                        </div>
                        <div className={`participant-row ${match.winner === match.p2 ? 'winner' : ''}`}>
                          <span>{match.p2}</span>
                          <span className="score">{match.score2 !== undefined ? match.score2 : ''}</span>
                        </div>
                        {!match.winner && (
                          <button onClick={() => runMatch(match)} className="btn btn-primary compact-btn">
                            Sing Match
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}

              {/* Semifinals */}
              <div className="bracket-column">
                <h3>Semifinals</h3>
                {matches
                  .filter((m) => m.round === 1)
                  .map((match) => (
                    <div key={match.id} className={`match-card ${match.winner ? 'complete' : ''}`}>
                      <div className={`participant-row ${match.winner === match.p1 ? 'winner' : ''}`}>
                        <span>{match.p1 || 'TBD'}</span>
                        <span className="score">{match.score1 !== undefined ? match.score1 : ''}</span>
                      </div>
                      <div className={`participant-row ${match.winner === match.p2 ? 'winner' : ''}`}>
                        <span>{match.p2 || 'TBD'}</span>
                        <span className="score">{match.score2 !== undefined ? match.score2 : ''}</span>
                      </div>
                      {match.p1 && match.p2 && !match.winner && (
                        <button onClick={() => runMatch(match)} className="btn btn-primary compact-btn">
                          Sing Match
                        </button>
                      )}
                    </div>
                  ))}
              </div>

              {/* Finals */}
              <div className="bracket-column">
                <h3>Finals</h3>
                {matches
                  .filter((m) => m.round === 2)
                  .map((match) => (
                    <div key={match.id} className={`match-card ${match.winner ? 'complete' : ''}`}>
                      <div className={`participant-row ${match.winner === match.p1 ? 'winner' : ''}`}>
                        <span>{match.p1 || 'TBD'}</span>
                        <span className="score">{match.score1 !== undefined ? match.score1 : ''}</span>
                      </div>
                      <div className={`participant-row ${match.winner === match.p2 ? 'winner' : ''}`}>
                        <span>{match.p2 || 'TBD'}</span>
                        <span className="score">{match.score2 !== undefined ? match.score2 : ''}</span>
                      </div>
                      {match.p1 && match.p2 && !match.winner && (
                        <button onClick={() => runMatch(match)} className="btn btn-primary compact-btn">
                          Sing Final Match
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Footer controls */}
            <div className="bracket-footer">
              {getWinnerOfTournament() ? (
                <div className="winner-declaration">
                  <Trophy size={24} style={{ color: '#fbbf24', animation: 'bounce 1s infinite' }} />
                  <span>
                    Tournament Winner: <strong>{getWinnerOfTournament()}</strong>!
                  </span>
                </div>
              ) : (
                <button
                  onClick={advanceRound}
                  disabled={matches.filter((m) => m.round === currentRound).some((m) => !m.winner)}
                  className="btn btn-accent animate-hover"
                >
                  <Check size={16} /> Advance to Next Round
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
