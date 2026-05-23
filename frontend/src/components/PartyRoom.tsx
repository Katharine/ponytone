import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Users, Volume2, Music, PhoneCall, PhoneOff, Award, Tv, Settings, X } from 'lucide-react';
import { Song } from '../utils/ultrastar';
import { CanvasRenderer } from './CanvasRenderer';
import type { PlayerState } from './CanvasRenderer';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { syncTime, fixedTimestamp } from '../utils/ntp';
import { Tournament } from './Tournament';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';

interface SongItem {
  id: number;
  title: string;
  artist: string;
  length: number;
  cover: string;
  duet?: string[];
}

interface Member {
  nick: string;
  colour: string;
  id: number;
}

interface PartyRoomProps {
  partyId: string;
  nick: string;
  mode: 'computer' | 'con';
  onLeave: () => void;
}

export const PartyRoom: React.FC<PartyRoomProps> = ({ partyId, nick, mode, onLeave }) => {
  // Navigation & state
  const [activeTab, setActiveTab] = useState<'lobby' | 'game' | 'results'>('lobby');
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [playlist, setPlaylist] = useState<number[]>([]);
  const [members, setMembers] = useState<{ [channelName: string]: Member }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  const [playersReadyState, setPlayersReadyState] = useState<{ [channel: string]: boolean }>({});
  const [playersLoadProgress, setPlayersLoadProgress] = useState<{ [channel: string]: number }>({});
  const [audioContextState, setAudioContextState] = useState<string>('suspended');
  const [audioInteractive, setAudioInteractive] = useState(false);
  
  // Game states
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [activeSongItem, setActiveSongItem] = useState<SongItem | null>(null);
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingSong, setLoadingSong] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [scoreList, setScoreList] = useState<{ nick: string; score: number; verified: boolean }[]>([]);
  // playOnTV: true in 'computer' mode (host is a singer), false in 'con' mode (host is display only).
  // Stored only in a ref since mode never changes after mount.
  const playOnTVRef = useRef(mode === 'computer');

  // Tournament
  const [showTournament, setShowTournament] = useState(false);
  const [tournamentMatchCallback, setTournamentMatchCallback] = useState<((s1: number, s2: number) => void) | null>(null);

  // Audio / WebRTC Voice Settings
  const [isVoiceSharing, setIsVoiceSharing] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(0.8);
  const [spectatorDelay, setSpectatorDelay] = useState(false); // 150ms delay for alignment
  
  // Settings Panel and Window Dimensions
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize AudioContext early to bypass browser autoplay blocks
  useEffect(() => {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;
      setAudioContextState(audioCtx.state);
      console.log('AudioContext initialized early. State:', audioCtx.state);

      const handleStateChange = () => {
        console.log('AudioContext state changed early listener:', audioCtx.state);
        setAudioContextState(audioCtx.state);
      };
      audioCtx.addEventListener('statechange', handleStateChange);

      return () => {
        audioCtx.removeEventListener('statechange', handleStateChange);
      };
    } else {
      console.error('AudioContext not supported in this browser!');
    }
  }, []);

  // Global handler to resume audio context on any user interaction
  useEffect(() => {
    const resume = () => {
      const ctx = audioContextRef.current;
      console.log('Global resume interaction fired. Context:', ctx ? ctx.state : 'null');
      if (ctx) {
        // Unlock browser audio hardware by playing a short, low-volume sine wave beep synchronously
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          
          // Play a very soft, short beep (volume 0.002, duration 0.05s) to activate output hardware
          gain.gain.setValueAtTime(0.002, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.05);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(0);
          osc.stop(ctx.currentTime + 0.05);
          console.log('Played dummy low-volume beep to unlock hardware destination.');
        } catch (e) {
          console.warn('Failed to play unlock beep:', e);
        }

        if (ctx.state === 'suspended') {
          ctx.resume().then(() => {
            console.log('AudioContext resumed via interaction. New state:', ctx.state);
            setAudioContextState(ctx.state);
            setAudioInteractive(true);
          }).catch((err) => {
            console.warn('Failed to resume audio context:', err);
          });
        } else {
          console.log('AudioContext already running. Setting interactive to true.');
          setAudioContextState(ctx.state);
          setAudioInteractive(true);
        }
      }
    };
    window.addEventListener('click', resume);
    window.addEventListener('keydown', resume);
    return () => {
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
    };
  }, []);
  
  // WebSockets and Refs
  const socketRef = useRef<WebSocket | null>(null);
  const myChannelRef = useRef<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<{ [channelName: string]: RTCPeerConnection }>({});
  const remoteAudioElementsRef = useRef<{ [channelName: string]: HTMLAudioElement }>({});
  
  // Game loop tracking
  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  // Player sung notes logs: playerID -> array of {time: beat, note: pitch}
  const [playersState, setPlayersState] = useState<PlayerState[]>([]);
  const playersStateRef = useRef<PlayerState[]>([]);

  // Paired companion mics
  const [pairedMics, setPairedMics] = useState<string[]>([]);
  const pairedMicsRef = useRef<string[]>([]);

  const membersRef = useRef<{ [channelName: string]: Member }>({});
  const songsRef = useRef<SongItem[]>([]);
  const activeSongRef = useRef<Song | null>(null);
  const activeSongItemRef = useRef<SongItem | null>(null);
  const selectedPartIndexRef = useRef(0);
  const gameTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const spectatorDelayRef = useRef(false);
  const tournamentMatchCallbackRef = useRef<((s1: number, s2: number) => void) | null>(null);

  useEffect(() => {
    playersStateRef.current = playersState;
  }, [playersState]);

  useEffect(() => {
    pairedMicsRef.current = pairedMics;
  }, [pairedMics]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    songsRef.current = songs;
  }, [songs]);

  useEffect(() => {
    activeSongRef.current = activeSong;
  }, [activeSong]);

  useEffect(() => {
    activeSongItemRef.current = activeSongItem;
  }, [activeSongItem]);

  useEffect(() => {
    selectedPartIndexRef.current = selectedPartIndex;
  }, [selectedPartIndex]);

  useEffect(() => {
    gameTimeRef.current = gameTime;
  }, [gameTime]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    spectatorDelayRef.current = spectatorDelay;
  }, [spectatorDelay]);

  useEffect(() => {
    tournamentMatchCallbackRef.current = tournamentMatchCallback;
  }, [tournamentMatchCallback]);

  // Early microphone permission request for computer mode
  useEffect(() => {
    if (mode === 'computer') {
      console.log('Requesting early microphone permission for Computer Mode...');
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
          console.log('Early microphone permission approved.');
        })
        .catch((err) => {
          console.warn('Early microphone permission denied or failed:', err);
        });
    }
  }, [mode]);

  // Generate local QR Code for Con Mode mobile pairing
  useEffect(() => {
    if (mode === 'con') {
      const pairingUrl = `${window.location.origin}/mic/${partyId}`;
      QRCode.toDataURL(pairingUrl, {
        width: 150,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
      .then((url) => {
        setQrCodeUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
      });
    }
  }, [partyId, mode]);

  // Connect WebSockets
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = mode === 'con'
      ? `${protocol}//${window.location.host}/ws/party/${partyId}?display=true`
      : `${protocol}//${window.location.host}/ws/party/${partyId}?nick=${encodeURIComponent(nick)}`;
    
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    let pingIntervalId: any = null;

    ws.onopen = () => {
      console.log('Connected to Karaoke Lobby WebSocket');
      // Perform initial handshake hello
      ws.send(JSON.stringify({
        action: 'hello',
        nick: nick,
      }));
      
      // Sync clock offsets
      syncTime();

      // Start ping keep-alive interval
      pingIntervalId = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: 'ping' }));
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket Action:', data.action);

      switch (data.action) {
        case 'hello':
          myChannelRef.current = data.channel;
          break;
        case 'member_list':
          setMembers(data.members || {});
          break;
        case 'playlist':
          setPlaylist(data.playlist || []);
          break;
        case 'new_member':
          setMembers((prev) => ({
            ...prev,
            [data.channel]: { nick: data.nick, colour: data.colour, id: data.id }
          }));
          setPlayersState((prev) =>
            prev.map((p) => {
              if (p.nick === data.nick) {
                console.log(`Re-associating player ${p.nick} to new channel ${data.channel}`);
                return { ...p, channel: data.channel };
              }
              return p;
            })
          );
          break;
        case 'member_left':
          setMembers((prev) => {
            const updated = { ...prev };
            delete updated[data.channel];
            return updated;
          });
          // Cleanup WebRTC connection
          if (peerConnectionsRef.current[data.channel]) {
            peerConnectionsRef.current[data.channel].close();
            delete peerConnectionsRef.current[data.channel];
          }
          if (remoteAudioElementsRef.current[data.channel]) {
            remoteAudioElementsRef.current[data.channel].remove();
            delete remoteAudioElementsRef.current[data.channel];
          }
          break;
        case 'readyCheckUpdate':
          setPlayersReadyState(data.readyStates || {});
          break;
        case 'loadProgressUpdate':
          setPlayersLoadProgress(data.progressStates || {});
          break;
        case 'loadTrack':
          setPlayersReadyState({});
          handleLoadTrack(data.song, data.part || 0);
          break;
        case 'returnedToLobby':
          setPlayersReadyState({});
          setPlayersLoadProgress({});
          setActiveTab('lobby');
          break;
        case 'startGame':
          handleStartGame(data.time);
          break;
        case 'sangNotes':
          // Another room participant shares their real-time note matches
          updatePlayerPitches(data.channel || data.origin, data.notes);
          break;
        case 'micPitch':
          // Paired companion phone mic sends a MIDI pitch value
          // We map this mic client's target channel, or if it is our companion, it targets us
          handleCompanionMicPitch(data.origin || '', data.target || '', data.note, data.time || 0);
          break;
        case 'micPaired':
          if (data.origin) {
            setPairedMics((prev) => {
              if (prev.includes(data.origin)) return prev;
              return [...prev, data.origin];
            });
          }
          break;
        case 'micDisconnected':
          if (data.origin) {
            setPairedMics((prev) => prev.filter((ch) => ch !== data.origin));
          }
          break;
        case 'selectPart': {
          // A phone player has chosen a part; update the player whose channel matches
          const isPaired = pairedMicsRef.current.includes(data.origin);
          // If the mic is paired to us, the assignment targets our own channel
          const targetChannel = isPaired ? myChannelRef.current : data.origin;
          setPlayersState((prev) =>
            prev.map((p) => {
              if (p.channel === targetChannel) {
                return { ...p, part: data.part };
              }
              return p;
            })
          );
          break;
        }
        case 'relay':
          // Relayed WebRTC Signaling SDP or ICE candidates
          handleWebRTCSignaling(data.origin, data.message);
          break;
      }
    };

    // Load available catalog
    fetch('/api/tracklist')
      .then((res) => res.json())
      .then((data) => setSongs(data))
      .catch((err) => console.error('Failed to load songs', err));

    return () => {
      if (pingIntervalId) clearInterval(pingIntervalId);
      ws.close();
      cleanupAudio();
      cleanupWebRTC();
    };
  }, [partyId, nick, mode]);

  // Setup WebRTC connections to newly joined members
  useEffect(() => {
    if (!isVoiceSharing) return;

    Object.keys(members).forEach((channelName) => {
      if (channelName === myChannelRef.current) return;
      if (!peerConnectionsRef.current[channelName]) {
        createPeerConnection(channelName);
      }
    });
  }, [members, isVoiceSharing]);

  // Clean audio source node
  const cleanupAudio = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioNodeRef.current) {
      try {
        audioNodeRef.current.stop();
      } catch (e) {}
      audioNodeRef.current.disconnect();
      audioNodeRef.current = null;
    }
    setIsPlaying(false);
    setCountdown(null);
  };

  const cleanupWebRTC = () => {
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};
    Object.values(remoteAudioElementsRef.current).forEach((el) => el.remove());
    remoteAudioElementsRef.current = {};
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  // WebRTC Peer Connection logic
  const createPeerConnection = async (targetChannel: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnectionsRef.current[targetChannel] = pc;

    // Add local audio track if sharing
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.send(JSON.stringify({
          action: 'relay',
          target: targetChannel,
          message: { type: 'candidate', candidate: e.candidate }
        }));
      }
    };

    pc.ontrack = (e) => {
      // Create audio element for remote stream
      if (remoteAudioElementsRef.current[targetChannel]) {
        remoteAudioElementsRef.current[targetChannel].srcObject = e.streams[0];
      } else {
        const audio = document.createElement('audio');
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        audio.volume = voiceVolume;
        remoteAudioElementsRef.current[targetChannel] = audio;
        document.body.appendChild(audio);
      }
    };

    // Decide initiator (lexicographical comparison)
    if (myChannelRef.current < targetChannel) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current?.send(JSON.stringify({
          action: 'relay',
          target: targetChannel,
          message: offer
        }));
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    }
  };

  const handleWebRTCSignaling = async (senderChannel: string, message: any) => {
    let pc = peerConnectionsRef.current[senderChannel];
    if (!pc) {
      // If we don't have connection yet, initialize one
      await createPeerConnection(senderChannel);
      pc = peerConnectionsRef.current[senderChannel];
    }

    if (message.type === 'offer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(message));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current?.send(JSON.stringify({
          action: 'relay',
          target: senderChannel,
          message: answer
        }));
      } catch (err) {
        console.error('Error answering WebRTC offer:', err);
      }
    } else if (message.type === 'answer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(message));
      } catch (err) {
        console.error('Error setting remote description:', err);
      }
    } else if (message.type === 'candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  };

  const toggleVoiceSharing = async () => {
    if (isVoiceSharing) {
      cleanupWebRTC();
      setIsVoiceSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setIsVoiceSharing(true);
        // Force establish connections
        Object.keys(members).forEach((channelName) => {
          if (channelName === myChannelRef.current) return;
          createPeerConnection(channelName);
        });
      } catch (err) {
        console.error('Failed to get local audio for voice chat:', err);
        alert('Could not access microphone for voice chat sharing.');
      }
    }
  };

  useEffect(() => {
    // Sync remote audio element volumes
    Object.values(remoteAudioElementsRef.current).forEach((audio) => {
      audio.volume = voiceVolume;
    });
  }, [voiceVolume]);

  // Queue logic
  const addToQueue = (songId: number) => {
    socketRef.current?.send(JSON.stringify({
      action: 'addToQueue',
      song: songId
    }));
  };

  const removeFromQueue = (songId: number) => {
    socketRef.current?.send(JSON.stringify({
      action: 'removeFromQueue',
      song: songId
    }));
  };

  // Launch Game Gameplay Setup
  const handleLoadTrack = async (songId: number, partIdx: number) => {
    cleanupAudio();
    setLoadingSong(true);
    setActiveTab('game');
    setSelectedPartIndex(partIdx);

    try {
      const songItem = songsRef.current.find((s) => s.id === songId) || null;
      setActiveSongItem(songItem);

      // Fetch notes file from S3
      const response = await fetch(`https://music.ponytone.online/${songId}/notes.txt`);
      if (!response.ok) throw new Error('Notes file could not be downloaded.');
      const notesText = await response.text();

      const songObj = new Song(`https://music.ponytone.online/${songId}`, notesText);
      setActiveSong(songObj);

      // Fetch audio file with progress tracking
      const audioCtx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      console.log('AudioContext state during handleLoadTrack:', audioCtx.state);

      const audioUrl = songObj.mp3 || `https://music.ponytone.online/${songId}/music.mp3`;
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) throw new Error('Audio file could not be downloaded.');

      const contentLength = audioResponse.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      let receivedBytes = 0;
      const chunks = [];
      const reader = audioResponse.body?.getReader();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            if (totalBytes > 0) {
              const pct = Math.round((receivedBytes / totalBytes) * 100);
              // Report progress (capped at 99% until decoding is complete)
              const reportPct = Math.min(99, pct);
              socketRef.current?.send(JSON.stringify({
                action: 'loadProgress',
                progress: reportPct,
              }));
            }
          }
        }
      }

      // Combine chunks into a single Uint8Array
      const allChunks = new Uint8Array(receivedBytes);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }

      const arrayBuffer = allChunks.buffer;
      console.log('Decoding audio data...');
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioBufferRef.current = decodedBuffer;
      console.log('Audio decoded successfully. Duration:', decodedBuffer.duration, 'channels:', decodedBuffer.numberOfChannels);

      const hasDuet = !!(songItem && songItem.duet && songItem.duet.length > 0);
      const numParts = (songItem && songItem.duet) ? songItem.duet.length : 1;

      // Construct Player states based on connected members
      // Include the TV host if they are playing or have companion mics
      const isLocalActive = playOnTVRef.current || pairedMicsRef.current.length > 0;
      const activePlayers: PlayerState[] = [];
      if (isLocalActive) {
        const myMember = membersRef.current[myChannelRef.current];
        activePlayers.push({
          id: 0,
          nick: myMember?.nick || nick,
          colour: myMember?.colour || '#058fbe',
          part: 0,
          score: 0,
          notes: [],
          channel: myChannelRef.current,
        });
      }
      Object.entries(membersRef.current)
        .filter(([ch]) => ch !== myChannelRef.current)
        .forEach(([ch, m], idx) => {
          activePlayers.push({
            id: isLocalActive ? idx + 1 : idx,
            nick: m.nick,
            colour: m.colour,
            part: hasDuet ? ((isLocalActive ? idx + 1 : idx) % numParts) : partIdx,
            score: 0,
            notes: [],
            channel: ch,
          });
        });
      // Apply round-robin duet parts
      if (hasDuet) {
        activePlayers.forEach((p, i) => { p.part = i % numParts; });
      }

      setPlayersState(activePlayers);
      setLoadingSong(false);

      // Build initial assignments to share with companion mics
      const initialAssignments: { [channel: string]: number } = {};
      activePlayers.forEach((p) => {
        if (p.channel) initialAssignments[p.channel] = p.part;
      });

      const partNames = songObj.parts.map((_, i) => songObj.partNames?.[i] || songItem?.duet?.[i] || `Part ${i + 1}`);

      // Broadcast client is ready to start (with part assignment info for phones)
      socketRef.current?.send(JSON.stringify({
        action: 'trackLoaded',
        song: songId,
        numParts: songObj.parts.length,
        partNames: partNames,
        assignments: initialAssignments
      }));

    } catch (err) {
      console.error('Error loading game track:', err);
      alert('Failed to load song files. Returning to lobby.');
      setActiveTab('lobby');
      setLoadingSong(false);
    }
  };

  // Start Sync Playback
  const handleStartGame = (serverStartTimestamp: number) => {
    console.log('handleStartGame triggered. Server start timestamp:', serverStartTimestamp);
    if (!audioContextRef.current) {
      console.error('handleStartGame error: audioContextRef.current is null!');
      return;
    }
    if (!audioBufferRef.current) {
      console.error('handleStartGame error: audioBufferRef.current is null!');
      return;
    }

    console.log('AudioContext state at handleStartGame start:', audioContextRef.current.state);

    // Ensure audio context is running (safeguard for async WS trigger)
    if (audioContextRef.current.state === 'suspended') {
      console.log('AudioContext is suspended in handleStartGame. Attempting to resume...');
      audioContextRef.current.resume().then(() => {
        console.log('AudioContext resume resolved inside handleStartGame. State:', audioContextRef.current!.state);
      }).catch((err) => {
        console.warn('Failed to resume audio context in handleStartGame:', err);
      });
    }

    // Compute localized startup delay
    const now = fixedTimestamp();
    let delay = (serverStartTimestamp - now) / 1000;
    console.log('Sync offset calculation - Server start:', serverStartTimestamp, 'Local NTP now:', now, 'Raw delay (sec):', delay);
    
    // Add spectator voice alignment delay if checked
    if (spectatorDelayRef.current) {
      delay += 0.15;
      console.log('Added spectator sync delay (+150ms). New delay:', delay);
    }

    try {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(audioContextRef.current.destination);
      audioNodeRef.current = source;
      console.log('Audio buffer source created and connected to destination.');

      if (delay > 0) {
        const playTime = audioContextRef.current.currentTime + delay;
        source.start(playTime);
        startTimeRef.current = playTime;
        console.log('Scheduled source.start in future at playTime:', playTime, 'Current time:', audioContextRef.current.currentTime);
      } else {
        source.start(0, -delay);
        startTimeRef.current = audioContextRef.current.currentTime + delay;
        console.log('Scheduled source.start immediately with offset:', -delay, 'Current time:', audioContextRef.current.currentTime);
      }
    } catch (err) {
      console.error('Error starting audio source in handleStartGame:', err);
    }

    setIsPlaying(true);
    isPlayingRef.current = true;
    
    // Run loop
    const frame = () => {
      const elapsedSec = audioContextRef.current!.currentTime - startTimeRef.current;
      const elapsedMs = Math.max(0, elapsedSec * 1000);
      setGameTime(elapsedMs);
      gameTimeRef.current = elapsedMs;

      if (elapsedSec < 0) {
        setCountdown(Math.ceil(-elapsedSec));
      } else {
        setCountdown(null);
      }

      if (elapsedMs >= audioBufferRef.current!.duration * 1000) {
        handleSongFinish();
      } else {
        animationFrameRef.current = requestAnimationFrame(frame);
      }
    };
    animationFrameRef.current = requestAnimationFrame(frame);
  };

  // Live pitch detections
  const handlePitchDetected = (note: any) => {
    if (!isPlayingRef.current || !activeSongRef.current) return;

    const currentBeat = activeSongRef.current.msToBeats(gameTimeRef.current);
    if (currentBeat < 0) return;

    // Send our real-time pitch to other clients
    socketRef.current?.send(JSON.stringify({
      action: 'sangNotes',
      notes: [{ time: currentBeat, note: note.number }]
    }));

    // Update locally
    setPlayersState((prev) =>
      prev.map((player) => {
        if (player.channel === myChannelRef.current) {
          // Check if it already exists to prevent duplicate beats
          const exists = player.notes.some((n) => n.time === currentBeat);
          if (exists) return player;
          
          const updatedNotes = [...player.notes, { time: currentBeat, note: note.number }];
          const score = calculateIncrementalScore(activeSongRef.current!, player.part, updatedNotes);

          return {
            ...player,
            notes: updatedNotes,
            score: score,
          };
        }
        return player;
      })
    );
  };

  // Run native microphone autocorrelation hook
  const { start: startMic, stop: stopMic } = useAudioEngine(handlePitchDetected);

  useEffect(() => {
    const hasLocalPlayer = playersStateRef.current.some(p => p.channel === myChannelRef.current);
    if (isPlaying && activeTab === 'game' && hasLocalPlayer) {
      startMic().catch((e) => console.error('Failed to trigger mic capture:', e));
    } else {
      stopMic();
    }
  }, [isPlaying, activeTab]);

  // Real-time helper to map score in client
  const calculateIncrementalScore = (song: Song, partIdx: number, sungNotes: { time: number; note: number }[]): number => {
    if (!song.parts[partIdx] || sungNotes.length === 0) return 0;
    const notesList = song.parts[partIdx].flatMap((l) => l.notes);
    if (notesList.length === 0) return 0;

    let hits = 0;
    sungNotes.forEach((sn) => {
      const match = notesList.find((n) => sn.time >= n.beat && sn.time < n.beat + n.length);
      if (match) {
        const diff = Math.abs((sn.note % 12) - (match.pitch % 12));
        const matchesPitch = diff <= 1 || diff >= 11;
        if (matchesPitch || match.type === 'F') {
          hits += match.type === '*' ? 2 : 1;
        }
      }
    });

    const totalWeight = notesList.reduce((sum, n) => sum + (n.type === '*' ? n.length * 2 : n.length), 0);
    return totalWeight > 0 ? Math.round((hits / totalWeight) * 10000) : 0;
  };

  // Handle updates from other players' WebSocket pitches
  const updatePlayerPitches = (channelName: string, remoteNotes: { time: number; note: number }[]) => {
    setPlayersState((prev) =>
      prev.map((player) => {
        if (player.channel === channelName) {
          let updatedNotes = [...player.notes];
          remoteNotes.forEach((rn) => {
            if (!updatedNotes.some((un) => un.time === rn.time)) {
              updatedNotes.push(rn);
            }
          });
          const score = activeSongRef.current ? calculateIncrementalScore(activeSongRef.current, player.part, updatedNotes) : 0;
          return {
            ...player,
            notes: updatedNotes,
            score: score,
          };
        }
        return player;
      })
    );
  };

  // Handle companion mic pitch streaming to screen
  const handleCompanionMicPitch = (origin: string, target: string, noteNumber: number, timeMs: number) => {
    if (!isPlayingRef.current || !activeSongRef.current) return;

    const currentBeat = activeSongRef.current.msToBeats(timeMs);
    if (currentBeat < 0) return;

    const targetChannel = target || origin;

    setPlayersState((prev) =>
      prev.map((player) => {
        if (player.channel === targetChannel) {
          const exists = player.notes.some((n) => n.time === currentBeat);
          if (exists) return player;
          const updatedNotes = [...player.notes, { time: currentBeat, note: noteNumber }];
          const score = calculateIncrementalScore(activeSongRef.current!, player.part, updatedNotes);

          // Broadcast this matched note to other screens in the room
          socketRef.current?.send(JSON.stringify({
            action: 'sangNotes',
            channel: targetChannel,
            notes: [{ time: currentBeat, note: noteNumber }]
          }));

          return {
            ...player,
            notes: updatedNotes,
            score: score,
          };
        }
        return player;
      })
    );
  };

  // Finish song gameplay
  const handleSongFinish = async () => {
    cleanupAudio();
    setActiveTab('results');
    
    if (!activeSongItemRef.current) return;

    // Send song finished event to socket
    socketRef.current?.send(JSON.stringify({ action: 'songFinished' }));

    const activePlayers = playersStateRef.current;
    for (const player of activePlayers) {
      try {
        const response = await fetch(`/api/songs/${activeSongItemRef.current.id}/highscores`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nick: player.nick,
            part: player.part,
            replay_log: player.notes.map((n) => ({ time: n.time, note: n.note }))
          }),
        });

        if (response.ok) {
          confetti({ particleCount: 50, spread: 60 });
        }
      } catch (e) {
        console.error(`Error submitting scoring verification for ${player.nick}:`, e);
      }
    }

    try {
      const scoresRes = await fetch(`/api/songs/${activeSongItemRef.current.id}/highscores`);
      if (scoresRes.ok) {
        const rankings = await scoresRes.json();
        setScoreList(rankings);
      }
    } catch (e) {
      console.error('Error fetching rankings:', e);
    }

    // If this was a tournament match, invoke the callback
    if (tournamentMatchCallbackRef.current) {
      const p1 = activePlayers[0]?.score || 0;
      const p2 = activePlayers[1]?.score || 0;
      tournamentMatchCallbackRef.current(p1, p2);
      setTournamentMatchCallback(null);
    }
  };

  // Initiate gameplay triggers
  /** Called from the TV UI to change a player's assigned duet part. */
  const handlePartChange = (playerChannel: string, newPartIndex: number) => {
    setPlayersState((prev) =>
      prev.map((p) => (p.channel === playerChannel ? { ...p, part: newPartIndex } : p))
    );
    // Broadcast the change so phones can reflect it
    socketRef.current?.send(JSON.stringify({
      action: 'selectPart',
      part: newPartIndex,
      channel: playerChannel,
    }));
  };

  const handleStartTournamentMatch = (_p1: string, _p2: string, callback: (s1: number, s2: number) => void) => {
    setTournamentMatchCallback(() => callback);
    setShowTournament(false);
    
    let songId = 0;
    if (playlist.length > 0) {
      songId = playlist[0];
    } else if (songs.length > 0) {
      songId = songs[0].id;
    } else {
      alert('Add songs to the playlist queue first!');
      return;
    }

    socketRef.current?.send(JSON.stringify({ action: 'clearQueue' }));
    socketRef.current?.send(JSON.stringify({ action: 'addToQueue', song: songId }));
  };

  const filteredSongsList = songs.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="party-room-container">
      {(!audioInteractive || audioContextState === 'suspended') && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'rgba(239, 68, 68, 0.9)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '16px',
          padding: '16px 24px',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '15px',
          boxShadow: '0 8px 32px rgba(239, 68, 68, 0.3)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'pulse 2s infinite',
          cursor: 'pointer',
        }}>
          <span style={{ fontSize: '20px' }}>🔊</span>
          <span>Click anywhere on this screen to enable audio playback & start synchronization!</span>
        </div>
      )}
      {/* Top Navbar */}
      <header className="party-navbar glass-panel">
        <div className="nav-brand">
          <Music size={24} style={{ color: '#c084fc' }} />
          <span>Ponytone Lobby: <strong>{partyId}</strong></span>
        </div>
        
        <div className="nav-controls">
          {/* Voice Chat share settings */}
          <button
            onClick={toggleVoiceSharing}
            className={`btn-nav ${isVoiceSharing ? 'active' : ''}`}
            title={isVoiceSharing ? 'Mute Voice' : 'Share Vocal Voice (WebRTC)'}
          >
            {isVoiceSharing ? <PhoneCall size={18} style={{ color: '#4ade80' }} /> : <PhoneOff size={18} />}
            <span>Voice Chat</span>
          </button>

          <button onClick={() => setShowTournament(true)} className="btn-nav">
            <Award size={18} />
            <span>Tournament</span>
          </button>

          <button onClick={onLeave} className="btn-leave">
            Leave Room
          </button>
        </div>
      </header>

      {/* Main interface switcher */}
      {activeTab === 'lobby' && (
        <>
          <div className="lobby-layout-grid">
          {/* Left panel: Song selection and playlist */}
          <div className="lobby-left-column">
            <section className="glass-panel search-section">
              <input
                type="text"
                placeholder="Search catalog by title or artist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="styled-input"
              />
              <div className="song-catalog-scroll">
                {filteredSongsList.map((song) => (
                  <div key={song.id} className="song-list-item">
                    <img
                      src={`https://music.ponytone.online/${song.id}/${song.cover || 'cover.png'}`}
                      alt=""
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.onerror = null;
                        img.src = '/favicon.svg';
                      }}
                      className="song-cover"
                    />
                    <div className="song-metadata">
                      <span className="title">{song.title}</span>
                      <span className="artist">{song.artist}</span>
                    </div>
                    <button onClick={() => addToQueue(song.id)} className="btn-add">
                      <Plus size={16} /> Add to Queue
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right panel: Active members & Current queue */}
          <div className="lobby-right-column">
            {/* Connected players */}
            <section className="glass-panel members-section">
              <h3>
                <Users size={18} /> Connected Singers ({Object.keys(members).length})
              </h3>
              
              {/* Mode indicator – replaces the old toggleable checkbox */}
              {mode === 'con' ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', marginBottom: '16px', borderRadius: '12px',
                  background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                  fontSize: '13px', color: '#c7d2fe',
                }}>
                  <Users size={15} style={{ flexShrink: 0, color: '#818cf8' }} />
                  <span><strong>Con Mode</strong> — TV is display only. All players connect via phone.</span>
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px', marginBottom: '16px', borderRadius: '12px',
                  background: 'rgba(192,132,252,0.06)', border: '1px solid rgba(192,132,252,0.2)',
                  fontSize: '13px', color: '#e9d5ff',
                }}>
                  <Tv size={15} style={{ flexShrink: 0, color: '#c084fc' }} />
                  <span><strong>Computer Mode</strong> — You are a singer using this device's mic.</span>
                </div>
              )}

              <div className="members-list">
                {Object.entries(members)
                  .filter(([ch]) => mode === 'con' ? ch !== myChannelRef.current : true)
                  .map(([ch, m]) => {
                    const isMe = ch === myChannelRef.current;
                    const isReady = playersReadyState[ch] || false;
                    return (
                      <div key={m.id} className="member-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="member-color-indicator" style={{ backgroundColor: m.colour, margin: 0 }} />
                          <span className="member-nick">{m.nick}</span>
                          {isMe && mode === 'computer' && (
                            <span className="member-you-badge">You</span>
                          )}
                        </div>
                        <span className={`ready-status-badge ${isReady ? 'ready' : 'not-ready'}`} style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          color: isReady ? '#4ade80' : '#f87171',
                          background: isReady ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                          border: isReady ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(248,113,113,0.2)',
                        }}>
                          {isReady ? 'Ready ✓' : 'Not Ready •'}
                        </span>
                      </div>
                    );
                  })}
              </div>

              {mode === 'computer' && (
                <div style={{ marginTop: '16px' }}>
                  <button
                    onClick={() => {
                      const currentReady = playersReadyState[myChannelRef.current] || false;
                      socketRef.current?.send(JSON.stringify({
                        action: 'readyToGo',
                        ready: !currentReady,
                      }));
                    }}
                    className={`btn ${playersReadyState[myChannelRef.current] ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ width: '100%', padding: '12px', borderRadius: '12px', fontWeight: 'bold' }}
                  >
                    {playersReadyState[myChannelRef.current] ? "I'm Not Ready" : 'Ready to Sing!'}
                  </button>
                </div>
              )}

              {/* QR pairing panel (only visible in Con Mode) */}
              {mode === 'con' && (
                <div className="qr-pairing-box" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <SmartphoneIcon size={24} style={{ color: '#c084fc' }} />
                    <h4 style={{ margin: 0 }}>Connect mobile microphone</h4>
                  </div>
                  <p style={{ margin: '0 0 12px 0' }}>Scan this QR code with your phone camera to join the stage:</p>
                  <div style={{
                    background: '#fff',
                    padding: '12px',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="QR Code to join party room"
                        style={{ width: '150px', height: '150px', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: '14px', fontWeight: 'bold' }}>
                        Generating...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Current Playlist Queue */}
            <section className="glass-panel queue-section">
              <h3>Playlist Queue</h3>
              {playlist.length === 0 ? (
                <p className="empty-queue-msg">The playlist is empty. Add songs to get started!</p>
              ) : (
                <div className="queue-list-scroll">
                  {playlist.map((songId, index) => {
                    const song = songs.find((s) => s.id === songId);
                    if (!song) return null;
                    return (
                      <div key={`${songId}-${index}`} className="queue-row">
                        <span className="number">#{index + 1}</span>
                        <div className="song-detail">
                          <span className="title">{song.title}</span>
                          <span className="artist">{song.artist}</span>
                        </div>
                        <div className="actions">
                          <button onClick={() => removeFromQueue(songId)} className="btn-remove">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
        </>
      )}      {activeTab === 'game' && (
        <div className="gameplay-arena">
          {/* Main Karaoke Screen rendering Canvas */}
          <div className="game-screen-wrapper">
            {activeSong && (
              <CanvasRenderer
                song={activeSong}
                players={playersState}
                currentTime={gameTime}
                duration={audioBufferRef.current ? audioBufferRef.current.duration * 1000 : 0}
                width={dimensions.width}
                height={dimensions.height}
                videoUrl={activeSong.video}
                posterUrl={activeSong.background}
                isPlaying={isPlaying}
              />
            )}

            {/* Waiting/Loading details */}
            {/* Unified Loading and Syncing Overlay */}
            {!isPlaying && (
              <div className="screen-waiting-overlay" style={{ zIndex: 20 }}>
                {/* Centered Glass Card */}
                <div className="glass-panel" style={{
                  padding: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  maxWidth: '480px',
                  width: '90%',
                  backdropFilter: 'blur(20px)',
                  background: 'rgba(15, 10, 25, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '24px',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                  textAlign: 'center',
                  boxSizing: 'border-box'
                }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>
                    {loadingSong ? 'Loading Song Assets...' : 'Waiting for Players...'}
                  </h3>
                  <p style={{ margin: '0 0 20px 0', color: '#a1a1aa', fontSize: '15px' }}>
                    {activeSongItem?.title} - {activeSongItem?.artist}
                  </p>

                  {/* Render per-computer loading progress bars */}
                  <div style={{ width: '100%', margin: '0 0 24px 0', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', boxSizing: 'border-box' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#c084fc', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', textAlign: 'left' }}>
                      Computer Nodes Progress
                    </h4>
                    {Object.keys(playersLoadProgress).length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px' }}>
                        <div className="spinner" style={{ width: '16px', height: '16px', margin: 0 }} />
                        Initializing connection...
                      </div>
                    ) : (
                      Object.entries(playersLoadProgress).map(([ch, progress]) => {
                        let displayName = 'Display Screen';
                        if (ch === myChannelRef.current) {
                          displayName = mode === 'computer' ? `${nick} (You)` : 'TV Display (You)';
                        } else if (members[ch]) {
                          displayName = members[ch].nick;
                        }
                        return (
                          <div key={ch} style={{ width: '100%', marginBottom: '14px', textAlign: 'left' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', fontWeight: 500 }}>
                              <span>{displayName}</span>
                              <span style={{ fontFamily: 'monospace', color: 'var(--accent-purple)' }}>{progress}%</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(to right, var(--accent-purple), var(--accent-indigo))', borderRadius: '4px', transition: 'width 0.2s ease-out' }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  
                  {/* Per-player duet part assignment (only shown for duet songs with multiple parts) */}
                  {activeSong && activeSong.parts.length > 1 && (
                    <div style={{
                      margin: '0 0 24px 0',
                      width: '100%',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '16px',
                      padding: '16px',
                      boxSizing: 'border-box',
                    }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#c084fc', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
                        Assign Duet Parts
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {playersState.map((player) => (
                          <div key={player.channel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: player.colour, flexShrink: 0 }} />
                              {player.nick}
                            </span>
                            <select
                              value={player.part}
                              onChange={(e) => handlePartChange(player.channel || '', parseInt(e.target.value))}
                              className="styled-select"
                              style={{ margin: 0, padding: '6px 12px', fontSize: '13px', flexShrink: 0 }}
                            >
                              {activeSong.parts.map((_, pIdx) => {
                                const partName = activeSong.partNames?.[pIdx] || activeSongItem?.duet?.[pIdx] || `Part ${pIdx + 1}`;
                                return <option key={pIdx} value={pIdx}>{partName}</option>;
                              })}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(4px)',
                flexDirection: 'column',
              }}>
                <div style={{
                  fontSize: '120px',
                  fontWeight: 900,
                  color: '#fff',
                  textShadow: '0 0 40px var(--accent-purple), 0 0 80px var(--accent-indigo)',
                  animation: 'pulse 1s infinite',
                }}>
                  {countdown}
                </div>
                <div style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  letterSpacing: '2px',
                  color: 'var(--accent-purple)',
                  textTransform: 'uppercase',
                  marginTop: '20px',
                }}>
                  Get Ready!
                </div>
              </div>
            )}
          </div>

          {/* Floating Settings Toggle Button */}
          <button
            onClick={() => setShowSettingsPanel((prev) => !prev)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              zIndex: 30,
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s',
            }}
            className="settings-toggle-btn animate-hover"
            title="Gameplay Settings"
          >
            {showSettingsPanel ? <X size={20} /> : <Settings size={20} />}
          </button>

          {/* Floating Settings Dropdown Panel */}
          {showSettingsPanel && (
            <div
              className="glass-panel"
              style={{
                position: 'absolute',
                top: '76px',
                right: '20px',
                zIndex: 30,
                width: '320px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                backdropFilter: 'blur(20px)',
                background: 'rgba(15, 10, 25, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                boxSizing: 'border-box'
              }}
            >
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#c084fc' }}>Gameplay Settings</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#a1a1aa' }}>
                  <Volume2 size={16} />
                  <label>Voice Chat Vol:</label>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                  className="styled-slider"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="setting-control checkbox" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="spectatorDelay"
                  checked={spectatorDelay}
                  onChange={(e) => setSpectatorDelay(e.target.checked)}
                  style={{ margin: 0 }}
                />
                <label htmlFor="spectatorDelay" style={{ cursor: 'pointer', color: '#e4e4e7', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tv size={14} style={{ color: '#c084fc' }} /> Spectator Sync Delay (+150ms)
                </label>
              </div>

              <button
                onClick={() => {
                  setShowSettingsPanel(false);
                  handleSongFinish();
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'background 0.2s',
                }}
                className="animate-hover"
              >
                Abort Song
              </button>
            </div>
          )}
        </div>
      )}
      {activeTab === 'results' && (
        <div className="glass-panel results-screen animate-fade-in">
          <h2>Singing Battle Results!</h2>
          <div className="results-podium">
            {playersState.sort((a, b) => b.score - a.score).map((player, idx) => (
              <div key={player.nick} className="podium-card animate-slide-up" style={{ animationDelay: `${idx * 0.2}s` }}>
                <span className="rank">#{idx + 1}</span>
                <span className="name" style={{ color: player.colour }}>{player.nick}</span>
                <span className="score">{player.score.toLocaleString()} pts</span>
              </div>
            ))}
          </div>

          <div className="song-leaderboard-results">
            <h3>Top Verified Leaderboard</h3>
            <table className="styled-table compact">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Singer</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scoreList.map((score, idx) => (
                  <tr key={idx}>
                    <td>#{idx + 1}</td>
                    <td>{score.nick}</td>
                    <td>{score.score.toLocaleString()}</td>
                    <td>{score.verified ? <span className="badge badge-verified">Verified</span> : 'Unverified'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => {
              socketRef.current?.send(JSON.stringify({ action: 'returnedToLobby' }));
              setActiveTab('lobby');
            }}
            className="btn btn-primary animate-hover"
          >
            Return to Lobby
          </button>
        </div>
      )}

      {/* Tournament Modal Overlay */}
      {showTournament && (
        <Tournament
          initialPlayers={Object.values(members).map((m) => m.nick)}
          onStartMatch={handleStartTournamentMatch}
          onClose={() => setShowTournament(false)}
        />
      )}
    </div>
  );
};

const SmartphoneIcon = ({ size = 20, style }: { size?: number; style?: React.CSSProperties }) => (
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
    style={style}
  >
    <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
    <path d="M12 18h.01" />
  </svg>
);
