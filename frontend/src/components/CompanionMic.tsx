import React, { useState, useEffect, useRef } from 'react';
import { useAudioEngine, type DetectedNote } from '../hooks/useAudioEngine';
import { Mic, MicOff, Wifi, WifiOff, Smartphone } from 'lucide-react';

const FONT = 'Ubuntu, sans-serif';

interface CompanionMicProps {
  partyId: string;
  targetChannel?: string; // The channel ID of the primary screen
}

export const CompanionMic: React.FC<CompanionMicProps> = ({ partyId, targetChannel = '' }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const [currentFreq, setCurrentFreq] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const handlePitch = (note: DetectedNote) => {
    if (note.number !== null && socketRef.current?.readyState === WebSocket.OPEN) {
      setCurrentNote(note.name);
      setCurrentFreq(note.freq ? Math.round(note.freq) : null);
      
      // Stream detected MIDI note to the primary screen
      socketRef.current.send(JSON.stringify({
        action: 'micPitch',
        note: note.number,
      }));
    } else {
      setCurrentNote(null);
      setCurrentFreq(null);
    }
  };

  const { isActive, start, stop } = useAudioEngine(handlePitch);

  useEffect(() => {
    // Connect to room WebSocket as a mic client targeting the primary screen
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/party/${partyId}?mic=true&target=${targetChannel}&nick=MobileMic`;
    
    setStatus('connecting');
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      console.log('WebSocket connected as mobile mic');
    };

    ws.onclose = () => {
      setStatus('disconnected');
      stop();
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatus('disconnected');
      stop();
    };

    return () => {
      ws.close();
      stop();
    };
  }, [partyId, targetChannel]);

  const toggleMic = async () => {
    if (isActive) {
      stop();
      setCurrentNote(null);
      setCurrentFreq(null);
    } else {
      await start();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c1b, #201335, #0c0813)',
      color: '#fff',
      padding: '24px',
      fontFamily: FONT,
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
          <Smartphone size={32} style={{ color: '#c084fc' }} />
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', background: 'linear-gradient(to right, #c084fc, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Companion Mic
          </h1>
        </div>
        <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Party Room: <span style={{ color: '#fff', fontWeight: 'bold' }}>{partyId}</span></p>
      </div>

      {/* Status Indicators */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        borderRadius: '20px',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginBottom: '40px',
        fontSize: '14px',
      }}>
        {status === 'connected' ? (
          <>
            <Wifi size={16} style={{ color: '#4ade80' }} />
            <span style={{ color: '#4ade80' }}>Connected to TV Screen</span>
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

      {/* Main Microphone Button */}
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
          marginBottom: '40px',
        }}
      >
        {isActive ? <Mic size={48} /> : <MicOff size={48} />}
        <span style={{ marginTop: '12px', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {isActive ? 'Mute Mic' : 'Tap to Sing'}
        </span>
      </button>

      {/* Real-time Pitch Feedback Panel */}
      <div style={{
        width: '100%',
        maxWidth: '320px',
        borderRadius: '16px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '24px',
        textAlign: 'center',
        backdropFilter: 'blur(10px)',
      }}>
        <p style={{ color: '#a1a1aa', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
          Detected Note
        </p>
        <div style={{
          height: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '48px',
          fontWeight: 'bold',
          color: currentNote ? '#c084fc' : '#3f3f46',
          textShadow: currentNote ? '0 0 20px rgba(192, 132, 252, 0.5)' : 'none',
          transition: 'all 0.15s ease'
        }}>
          {currentNote || '--'}
        </div>
        {currentFreq && (
          <p style={{ color: '#71717a', fontSize: '14px', marginTop: '8px' }}>
            {currentFreq} Hz
          </p>
        )}
      </div>

      {/* CSS Animation style */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
