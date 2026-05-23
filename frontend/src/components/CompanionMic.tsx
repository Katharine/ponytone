import React, { useState, useEffect, useRef } from 'react';
import { useAudioEngine, type DetectedNote } from '../hooks/useAudioEngine';
import { Mic, MicOff, Wifi, WifiOff, Smartphone, User, Link, Check } from 'lucide-react';
import { syncTime, fixedTimestamp } from '../utils/ntp';

const FONT = 'Ubuntu, sans-serif';

interface CompanionMicProps {
  partyId: string;
}

interface Member {
  nick: string;
  colour: string;
  id: number;
}

export const CompanionMic: React.FC<CompanionMicProps> = ({ partyId }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  
  // Registration and pairing states
  const [members, setMembers] = useState<{ [channelName: string]: Member }>({});
  const [nicknameInput, setNicknameInput] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isPaired, setIsPaired] = useState(false);
  const [pairedTargetChannel, setPairedTargetChannel] = useState<string>('');
  const [registeredNick, setRegisteredNick] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  // Ready Check & Sync Load States
  const [songs, setSongs] = useState<any[]>([]);
  const [playersReadyState, setPlayersReadyState] = useState<{ [channel: string]: boolean }>({});
  const [playersLoadProgress, setPlayersLoadProgress] = useState<{ [channel: string]: number }>({});
  const [isSongLoading, setIsSongLoading] = useState(false);
  const [loadingSongId, setLoadingSongId] = useState<number | null>(null);

  // Duet part states
  const [assignedPartName, setAssignedPartName] = useState<string>('');
  const [duetPartsCount, setDuetPartsCount] = useState<number>(0);
  const [duetPartNames, setDuetPartNames] = useState<string[]>([]);
  const [selectedPartIndex, setSelectedPartIndex] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const serverStartTimestampRef = useRef<number>(0);
  const myChannelRef = useRef<string>('');

  // Parse target channel from URL query string if present
  const queryParams = new URLSearchParams(window.location.search);
  const initialTarget = queryParams.get('target') || '';

  const handlePitch = (note: DetectedNote) => {
    if (note.number !== null && socketRef.current?.readyState === WebSocket.OPEN) {
      const now = fixedTimestamp();
      const serverStart = serverStartTimestampRef.current;
      
      // Calculate playback position in ms with a 50ms latency deduction for hardware capture delay
      const playbackMs = serverStart > 0 ? (now - serverStart - 50) : 0;
      
      socketRef.current.send(JSON.stringify({
        action: 'micPitch',
        note: note.number,
        time: playbackMs,
      }));
    }
  };

  const { isActive, start: startAudioEngine, stop: stopAudioEngine } = useAudioEngine(handlePitch);

  const isRegisteredRef = useRef(isRegistered);
  const isPairedRef = useRef(isPaired);
  const registeredNickRef = useRef(registeredNick);
  const pairedTargetChannelRef = useRef(pairedTargetChannel);

  useEffect(() => {
    isRegisteredRef.current = isRegistered;
  }, [isRegistered]);

  useEffect(() => {
    isPairedRef.current = isPaired;
  }, [isPaired]);

  useEffect(() => {
    registeredNickRef.current = registeredNick;
  }, [registeredNick]);

  useEffect(() => {
    pairedTargetChannelRef.current = pairedTargetChannel;
  }, [pairedTargetChannel]);

  useEffect(() => {
    fetch('/api/tracklist')
      .then((r) => r.json())
      .then((data) => setSongs(data))
      .catch((err) => console.error('Error fetching tracklist:', err));
  }, []);

  useEffect(() => {
    // Apply layout resets to document and body for the companion mic page
    document.documentElement.classList.add('mic-page-html');
    document.body.classList.add('mic-page-body');

    // Initial NTP clock synchronization
    syncTime();

    let isDisposed = false;
    let reconnectTimeoutId: any = null;
    let pingIntervalId: any = null;

    const connect = () => {
      if (isDisposed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/party/${partyId}?mic=true`;
      
      setStatus('connecting');
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (isDisposed) {
          ws.close();
          return;
        }
        setStatus('connected');
        console.log('WebSocket connected as companion mic');

        // Start ping keep-alive interval
        pingIntervalId = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'ping' }));
          }
        }, 20000);

        // Automatically re-register or re-pair if we had an active state
        if (isRegisteredRef.current && registeredNickRef.current) {
          console.log(`Re-registering player: ${registeredNickRef.current}`);
          ws.send(JSON.stringify({
            action: 'registerPlayer',
            nick: registeredNickRef.current,
          }));
        } else if (isPairedRef.current && pairedTargetChannelRef.current) {
          console.log(`Re-pairing microphone to target channel: ${pairedTargetChannelRef.current}`);
          ws.send(JSON.stringify({
            action: 'pairMic',
            target: pairedTargetChannelRef.current,
          }));
        }
      };

      ws.onmessage = (event) => {
        if (isDisposed) return;
        const data = JSON.parse(event.data);
        switch (data.action) {
          case 'hello':
            myChannelRef.current = data.channel || '';
            setMembers(data.members || {});
            break;
          case 'new_member':
            setMembers((prev) => ({
              ...prev,
              [data.channel]: { nick: data.nick, colour: data.colour, id: data.id }
            }));
            break;
          case 'member_left':
            setMembers((prev) => {
              const updated = { ...prev };
              delete updated[data.channel];
              return updated;
            });
            break;
          case 'micPaired':
            if (data.target) {
              setIsPaired(true);
              setIsRegistered(false);
              setPairedTargetChannel(data.target);
            }
            break;
          case 'readyCheckUpdate':
            setPlayersReadyState(data.readyStates || {});
            break;
          case 'loadProgressUpdate':
            setPlayersLoadProgress(data.progressStates || {});
            break;
          case 'loadTrack':
            setIsSongLoading(true);
            setLoadingSongId(data.song);
            break;
          case 'trackLoaded': {
            const numParts = data.numParts || 1;
            const partNames = data.partNames || [];
            setDuetPartsCount(numParts);
            setDuetPartNames(partNames);
            
            const myCh = myChannelRef.current;
            const pairedCh = pairedTargetChannelRef.current;
            const effectiveChannel = isRegisteredRef.current ? myCh : (isPairedRef.current ? pairedCh : '');
            if (effectiveChannel && data.assignments && data.assignments[effectiveChannel] !== undefined) {
              setSelectedPartIndex(data.assignments[effectiveChannel]);
            }
            break;
          }
          case 'lobbySongParts':
            setDuetPartsCount(data.partNames ? data.partNames.length : 0);
            setDuetPartNames(data.partNames || []);
            break;
          case 'selectPart': {
            const myCh = myChannelRef.current;
            const pairedCh = pairedTargetChannelRef.current;
            const targetCh = data.channel || data.target;
            if (targetCh === myCh || (isPairedRef.current && targetCh === pairedCh)) {
              setSelectedPartIndex(data.part);
            }
            break;
          }
          case 'startGame':
            serverStartTimestampRef.current = data.time;
            setIsPlaying(true);
            setIsSongLoading(false);
            setLoadingSongId(null);
            
            // Determine our assigned part name
            const myCh = myChannelRef.current;
            const pairedCh = pairedTargetChannelRef.current;
            const effectiveChannel = isRegisteredRef.current ? myCh : (isPairedRef.current ? pairedCh : '');
            if (effectiveChannel && data.assignments && data.assignments[effectiveChannel]) {
              setAssignedPartName(data.assignments[effectiveChannel].partName);
            } else {
              setAssignedPartName('');
            }

            // Automatically trigger microphone activation on game start
            startAudioEngine().catch((e) => console.error('Failed to trigger audio engine:', e));
            break;
          case 'songFinished':
          case 'returnedToLobby':
            setIsPlaying(false);
            setIsSongLoading(false);
            setLoadingSongId(null);
            setAssignedPartName('');
            setDuetPartsCount(0);
            setDuetPartNames([]);
            setSelectedPartIndex(0);
            stopAudioEngine();
            break;
        }
      };

      ws.onclose = () => {
        if (pingIntervalId) clearInterval(pingIntervalId);
        if (isDisposed) return;
        setStatus('disconnected');
        
        // Schedule reconnection
        console.log('WebSocket closed. Retrying connection in 2 seconds...');
        reconnectTimeoutId = setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
      if (pingIntervalId) clearInterval(pingIntervalId);
      if (socketRef.current) socketRef.current.close();
      stopAudioEngine();

      // Clean up layout resets on document and body
      document.documentElement.classList.remove('mic-page-html');
      document.body.classList.remove('mic-page-body');
    };
  }, [partyId, initialTarget]);



  const handleRegister = () => {
    if (!nicknameInput.trim() || !socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      action: 'registerPlayer',
      nick: nicknameInput.trim(),
    }));
    setRegisteredNick(nicknameInput.trim());
    setIsRegistered(true);
    setIsPaired(false);
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handlePair = (targetChannel: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      action: 'pairMic',
      target: targetChannel,
    }));
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const toggleMic = async () => {
    if (isActive) {
      stopAudioEngine();
    } else {
      await startAudioEngine();
    }
  };

  const getPairedPlayerName = () => {
    if (pairedTargetChannel && members[pairedTargetChannel]) {
      return members[pairedTargetChannel].nick;
    }
    return 'Lobby Player';
  };

  const showSetupScreen = !isRegistered && !isPaired;

  return (
    <div className="mobile-app-container" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minHeight: '100dvh',
      width: '100%',
      color: '#fff',
      fontFamily: FONT,
      boxSizing: 'border-box'
    }}>
      <div style={{
        margin: 'auto 0',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          <Smartphone size={32} style={{ color: '#c084fc' }} />
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', background: 'linear-gradient(to right, #c084fc, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Ponytone
          </h1>
        </div>
      </div>

      {/* Connection Status Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '20px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '30px',
        fontSize: '14px',
      }}>
        {status === 'connected' ? (
          <>
            <Wifi size={16} style={{ color: '#4ade80' }} />
            <span style={{ color: '#4ade80' }}>Connected to Server</span>
          </>
        ) : status === 'connecting' ? (
          <>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '2px solid #fbbf24',
              borderTopColor: 'transparent',
              animation: 'spin 1s linear infinite'
            }} />
            <span style={{ color: '#fbbf24' }}>Connecting...</span>
          </>
        ) : (
          <>
            <WifiOff size={16} style={{ color: '#f87171' }} />
            <span style={{ color: '#f87171' }}>Disconnected</span>
          </>
        )}
      </div>

      {showSetupScreen ? (
        /* Configuration / Pairing Selection Screen */
        <div style={{
          width: '100%',
          maxWidth: '360px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '24px',
          backdropFilter: 'blur(10px)',
          boxSizing: 'border-box'
        }}>
          {/* Join as Player Form */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc' }}>
              <User size={18} /> Join as New Player
            </h3>
            <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '-8px 0 16px 0' }}>
              Sing as your own independent player. Your score will appear separately on the TV.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Enter Nickname..."
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                maxLength={15}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: '#fff',
                  fontSize: '16px',
                  outline: 'none',
                  fontFamily: FONT
                }}
              />
              <button
                onClick={handleRegister}
                disabled={!nicknameInput.trim() || status !== 'connected'}
                style={{
                  padding: '12px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #c084fc, #6366f1)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: (nicknameInput.trim() && status === 'connected') ? 'pointer' : 'not-allowed',
                  opacity: (nicknameInput.trim() && status === 'connected') ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                  fontFamily: FONT
                }}
              >
                Join
              </button>
            </div>
          </div>

          <div style={{
            height: '1px',
            background: 'linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent)',
            margin: '24px 0'
          }} />

          {/* Pair with Player List */}
          <div>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc' }}>
              <Link size={18} /> Pair with Existing Singer
            </h3>
            <p style={{ fontSize: '13px', color: '#a1a1aa', margin: '-8px 0 16px 0' }}>
              Use your phone as a microphone for a player already on the TV screen.
            </p>
            
            {Object.keys(members).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: '#71717a', fontSize: '14px' }}>
                No active players in lobby.
              </div>
            ) : (
              <div className="singer-pair-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {Object.entries(members)
                  .sort(([chA], [chB]) => {
                    if (chA === initialTarget) return -1;
                    if (chB === initialTarget) return 1;
                    return 0;
                  })
                  .map(([channel, member]) => {
                    const isQueryTarget = channel === initialTarget;
                    return (
                      <button
                        key={channel}
                        onClick={() => handlePair(channel)}
                        disabled={status !== 'connected'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: isQueryTarget ? '1px solid rgba(192, 132, 252, 0.5)' : '1px solid rgba(255, 255, 255, 0.05)',
                          background: isQueryTarget ? 'rgba(192, 132, 252, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                          color: '#fff',
                          cursor: status === 'connected' ? 'pointer' : 'not-allowed',
                          textAlign: 'left',
                          transition: 'background 0.2s',
                          fontFamily: FONT
                        }}
                        onMouseEnter={(e) => {
                          if (status === 'connected') e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                        }}
                        onMouseLeave={(e) => {
                          if (status === 'connected') e.currentTarget.style.background = isQueryTarget ? 'rgba(192, 132, 252, 0.1)' : 'rgba(255, 255, 255, 0.02)';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: member.colour }} />
                          <span style={{ fontWeight: '500', fontSize: '14px' }}>{member.nick}</span>
                        </div>
                        <span style={{ fontSize: '12px', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isQueryTarget && <Check size={12} />} Pair Mic
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Active Microphone Screen */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
          {/* Target details */}
          <div style={{
            padding: '8px 16px',
            borderRadius: '20px',
            background: 'rgba(192, 132, 252, 0.1)',
            border: '1px solid rgba(192, 132, 252, 0.2)',
            marginBottom: '30px',
            fontSize: '15px',
            fontWeight: 'bold',
            color: '#e9d5ff',
            textAlign: 'center'
          }}>
            {isRegistered ? (
              <span>Playing as: <span style={{ color: '#fff' }}>{registeredNick}</span></span>
            ) : (
              <span>Paired mic for: <span style={{ color: '#fff' }}>{getPairedPlayerName()}</span></span>
            )}
          </div>

          {isSongLoading ? (
            /* Song Loading Progress Screen */
            (() => {
              const loadingSong = songs.find(s => s.id === loadingSongId);
              return (
                <div style={{
                  width: '100%',
                  maxWidth: '320px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  alignItems: 'center',
                }}>
                  <div style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '24px',
                    padding: '24px',
                    backdropFilter: 'blur(10px)',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                  }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#c084fc', fontWeight: 'bold' }}>Loading Song...</h3>
                    {loadingSong ? (
                      <p style={{ margin: '0 0 20px 0', color: '#a1a1aa', fontSize: '14px' }}>
                        <strong>{loadingSong.title}</strong><br />{loadingSong.artist}
                      </p>
                    ) : (
                      <p style={{ margin: '0 0 20px 0', color: '#a1a1aa', fontSize: '14px' }}>Downloading notes & audio...</p>
                    )}

                    <div style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', boxSizing: 'border-box', marginBottom: '16px' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#c084fc', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        TV / Computer Progress
                      </h4>
                      {Object.keys(playersLoadProgress).length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '13px', textAlign: 'left' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.2)', borderTopColor: '#c084fc', animation: 'spin 1s linear infinite' }} />
                          Waiting for TV to start download...
                        </div>
                      ) : (
                        Object.entries(playersLoadProgress).map(([ch, progress]) => {
                          let displayName = 'Display Screen';
                          if (ch === pairedTargetChannel) {
                            displayName = 'Host TV (Paired)';
                          } else if (members[ch]) {
                            displayName = members[ch].nick;
                          }
                          return (
                            <div key={ch} style={{ width: '100%', marginBottom: '12px', textAlign: 'left' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
                                <span>{displayName}</span>
                                <span style={{ fontFamily: 'monospace', color: '#c084fc' }}>{progress}%</span>
                              </div>
                              <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(to right, #c084fc, #6366f1)', borderRadius: '3px', transition: 'width 0.2s ease-out' }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    
                    <p style={{ fontSize: '12px', color: '#a1a1aa', margin: 0 }}>
                      Syncing audio playback. Game will start automatically when loading finishes.
                    </p>
                  </div>

                  {duetPartsCount > 1 && (
                    <div style={{
                      width: '100%',
                      borderRadius: '16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '16px',
                      textAlign: 'center',
                      backdropFilter: 'blur(10px)',
                      boxSizing: 'border-box'
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Select Duet Part
                      </h4>
                      <div className="duet-part-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                        {Array.from({ length: duetPartsCount }).map((_, idx) => {
                          const partName = duetPartNames[idx] || `Part ${idx + 1}`;
                          const isSelected = selectedPartIndex === idx;
                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                setSelectedPartIndex(idx);
                                socketRef.current?.send(JSON.stringify({
                                  action: 'selectPart',
                                  part: idx,
                                  channel: myChannelRef.current,
                                }));
                              }}
                              style={{
                                padding: '12px',
                                borderRadius: '10px',
                                border: isSelected ? '1px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.1)',
                                background: isSelected ? 'rgba(192, 132, 252, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                                color: '#fff',
                                fontWeight: isSelected ? 'bold' : 'normal',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontFamily: FONT,
                                fontSize: '14px',
                              }}
                            >
                              {partName} {isSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : isPlaying ? (
            /* Microphone Screen (Active Capture) */
            <>
              {assignedPartName && assignedPartName !== 'Solo' && (
                <div style={{
                  fontSize: '15px',
                  color: '#c084fc',
                  fontWeight: 'bold',
                  background: 'rgba(192, 132, 252, 0.1)',
                  border: '1px solid rgba(192, 132, 252, 0.2)',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  marginBottom: '20px',
                  textAlign: 'center'
                }}>
                  🎤 Singing: {assignedPartName}
                </div>
              )}

              {/* Interactive Mic Button */}
              <button
                onClick={toggleMic}
                disabled={status !== 'connected'}
                style={{
                  width: '160px',
                  height: '160px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isActive
                    ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                    : 'linear-gradient(135deg, #c084fc, #6366f1)',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: status === 'connected' ? 'pointer' : 'not-allowed',
                  boxShadow: isActive
                    ? '0 0 40px rgba(239, 68, 68, 0.4)'
                    : '0 0 40px rgba(192, 132, 252, 0.3)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                  opacity: status === 'connected' ? 1 : 0.5,
                  marginBottom: '30px',
                }}
              >
                {isActive ? <Mic size={48} /> : <MicOff size={48} />}
                <span style={{ marginTop: '12px', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {isActive ? 'Mute Mic' : 'Tap to Sing'}
                </span>
              </button>
            </>
          ) : (
            /* Lobby Ready Check Screen */
            (() => {
              const effectiveChannel = isRegistered ? myChannelRef.current : (isPaired ? pairedTargetChannel : '');
              return (
                <div style={{
                  width: '100%',
                  maxWidth: '320px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '24px',
                  padding: '24px',
                  backdropFilter: 'blur(10px)',
                  boxSizing: 'border-box',
                  textAlign: 'center',
                }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#c084fc', fontWeight: 'bold' }}>Lobby Ready Check</h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', textAlign: 'left' }}>
                    {Object.entries(members).map(([ch, member]) => {
                      const isMe = ch === effectiveChannel;
                      const isReady = playersReadyState[ch] || false;
                      return (
                        <div key={ch} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          padding: '10px 14px',
                          borderRadius: '10px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: member.colour }} />
                            <span style={{ fontSize: '14px', fontWeight: 500 }}>
                              {member.nick} {isMe && ' (You)'}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: isReady ? '#4ade80' : '#fbbf24',
                          }}>
                            {isReady ? 'Ready ✓' : 'Not Ready •'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {duetPartsCount > 1 && (
                    <div style={{
                      width: '100%',
                      borderRadius: '16px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '16px',
                      textAlign: 'center',
                      backdropFilter: 'blur(10px)',
                      boxSizing: 'border-box',
                      marginBottom: '20px',
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Select Duet Part
                      </h4>
                      <div className="duet-part-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                        {Array.from({ length: duetPartsCount }).map((_, idx) => {
                          const partName = duetPartNames[idx] || `Part ${idx + 1}`;
                          const isSelected = selectedPartIndex === idx;
                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                setSelectedPartIndex(idx);
                                socketRef.current?.send(JSON.stringify({
                                  action: 'selectPart',
                                  part: idx,
                                  channel: myChannelRef.current,
                                }));
                              }}
                              style={{
                                padding: '12px',
                                borderRadius: '10px',
                                border: isSelected ? '1px solid #c084fc' : '1px solid rgba(255, 255, 255, 0.1)',
                                background: isSelected ? 'rgba(192, 132, 252, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                                color: '#fff',
                                fontWeight: isSelected ? 'bold' : 'normal',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontFamily: FONT,
                                fontSize: '14px',
                              }}
                            >
                              {partName} {isSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const isReady = playersReadyState[effectiveChannel] || false;
                      socketRef.current?.send(JSON.stringify({
                        action: 'readyToGo',
                        ready: !isReady,
                      }));
                    }}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      background: (playersReadyState[effectiveChannel] || false)
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'linear-gradient(135deg, #c084fc, #6366f1)',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: (playersReadyState[effectiveChannel] || false)
                        ? 'none'
                        : '0 0 20px rgba(192, 132, 252, 0.3)',
                      fontFamily: FONT,
                    }}
                  >
                    {(playersReadyState[effectiveChannel] || false) ? "I'm Not Ready" : 'Ready to Sing!'}
                  </button>
                </div>
              );
            })()
          )}

          <button
            onClick={() => {
              // Unpair/unregister and return to setup screen
              if (socketRef.current) {
                window.location.reload();
              }
            }}
            style={{
              marginTop: '20px',
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '13px',
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            Change Mode / Player
          </button>
        </div>
      )}
      </div>

      {/* CSS Animation styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 0.6; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
