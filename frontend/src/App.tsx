import { useState, useEffect } from 'react';
import { Home } from './components/Home';
import { PartyRoom } from './components/PartyRoom';
import { CompanionMic } from './components/CompanionMic';
import { Leaderboard } from './components/Leaderboard';

function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentSearch, setCurrentSearch] = useState(window.location.search);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
      setCurrentSearch(window.location.search);
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('navigate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('navigate', handleLocationChange);
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event('navigate'));
  };

  const handleJoinParty = (partyId: string, nick: string, mode: 'computer' | 'con') => {
    navigate(`/party/${partyId}?nick=${encodeURIComponent(nick)}&mode=${mode}`);
  };

  const handleCreateParty = async (nick: string, mode: 'computer' | 'con') => {
    try {
      const response = await fetch('/api/create_party', { method: 'POST' });
      if (!response.ok) throw new Error('Network error');
      const partyId = await response.text();
      navigate(`/party/${partyId}?nick=${encodeURIComponent(nick)}&mode=${mode}`);
    } catch (err) {
      console.error(err);
      alert('Failed to create new karaoke room. Please try again.');
    }
  };


  if (currentPath === '/' || currentPath === '') {
    return (
      <Home
        onJoinParty={handleJoinParty}
        onCreateParty={handleCreateParty}
        onGoToLeaderboard={() => navigate('/leaderboard')}
      />
    );
  }

  if (currentPath.startsWith('/party/')) {
    const partyId = currentPath.substring(7);
    const searchParams = new URLSearchParams(currentSearch);
    const nick = searchParams.get('nick') || localStorage.getItem('ponytone_nick') || 'Host';
    const rawMode = searchParams.get('mode');
    const mode: 'computer' | 'con' = rawMode === 'con' ? 'con' : 'computer';

    return (
      <PartyRoom
        partyId={partyId}
        nick={nick}
        mode={mode}
        onLeave={() => navigate('/')}
      />
    );
  }

  if (currentPath.startsWith('/mic/')) {
    const partyId = currentPath.substring(5);
    return <CompanionMic partyId={partyId} />;
  }

  if (currentPath === '/leaderboard') {
    return <Leaderboard onBack={() => navigate('/')} />;
  }

  // 404
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', background: '#121214',
      color: '#fff', fontFamily: 'sans-serif'
    }}>
      <h1>404: Page Not Found</h1>
      <p style={{ color: '#aaa', marginBottom: '24px' }}>The singing arena you are looking for does not exist.</p>
      <button
        onClick={() => navigate('/')}
        style={{ padding: '12px 24px', borderRadius: '8px', background: '#c084fc', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
      >
        Go Home
      </button>
    </div>
  );
}

export default App;
