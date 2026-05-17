import { useState, useCallback } from 'react';
import { Participant, Match, Prediction } from './types';
import { DEMO_PARTICIPANTS, DEMO_MATCHES, DEMO_LEADERBOARD } from './lib/data';
import IdentitySelector from './components/IdentitySelector';
import TopNav from './components/TopNav';
import Dashboard from './components/Dashboard';
import Leaderboard from './components/Leaderboard';
import PredictionHistory from './components/PredictionHistory';
import PredictionModal from './components/PredictionModal';

function App() {
  const [currentUser, setCurrentUser] = useState<Participant | null>(() => {
    const saved = localStorage.getItem('wc2026_user');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [balance, setBalance] = useState(1000000);
  const [inPlay, setInPlay] = useState(0);
  const [predictions, setPredictions] = useState<Map<string, Prediction>>(new Map());
  const [predictingMatch, setPredictingMatch] = useState<Match | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Use demo data (will be replaced by Supabase queries)
  const matches = DEMO_MATCHES;
  const leaderboard = DEMO_LEADERBOARD;
  const participants = DEMO_PARTICIPANTS;

  const handleSelectIdentity = useCallback((participant: Participant) => {
    setCurrentUser(participant);
    localStorage.setItem('wc2026_user', JSON.stringify(participant));
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('wc2026_user');
  }, []);

  const handleNavigate = useCallback((page: string) => {
    setCurrentPage(page);
  }, []);

  const handleOpenPredict = useCallback((match: Match) => {
    setPredictingMatch(match);
  }, []);

  const handleSubmitPrediction = useCallback((matchId: string, prediction: string, stake: number) => {
    const newPrediction: Prediction = {
      id: `pred-${Date.now()}`,
      participant_id: currentUser?.id || '',
      match_id: matchId,
      prediction: prediction as Prediction['prediction'],
      stake,
      status: 'PENDING',
      payout: null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setPredictions(prev => {
      const next = new Map(prev);
      next.set(matchId, newPrediction);
      return next;
    });

    setBalance(prev => prev - stake);
    setInPlay(prev => prev + stake);
    setPredictingMatch(null);

    // Show toast
    const matchObj = matches.find(m => m.id === matchId);
    const teamName = prediction.includes('HOME')
      ? matchObj?.home_team
      : prediction === 'DRAW' ? 'Draw'
      : matchObj?.away_team;
    showToast(`Prediction locked! Staking ${new Intl.NumberFormat('en-US').format(stake)} coins on ${teamName}.`);
  }, [currentUser, matches]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  // Identity selector screen
  if (!currentUser) {
    return (
      <IdentitySelector
        participants={participants}
        onSelect={handleSelectIdentity}
      />
    );
  }

  // Build match lookup for history
  const matchMap = new Map(matches.map(m => [m.id, m]));
  const predictionsList = Array.from(predictions.values());

  return (
    <div className="app">
      <TopNav
        participant={currentUser}
        balance={balance}
        inPlay={inPlay}
        onNavigate={handleNavigate}
        currentPage={currentPage}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {currentPage === 'dashboard' && (
          <Dashboard
            matches={matches}
            predictions={predictions}
            onPredict={handleOpenPredict}
          />
        )}
        {currentPage === 'leaderboard' && (
          <Leaderboard
            entries={leaderboard}
            currentParticipantId={currentUser.id}
          />
        )}
        {currentPage === 'history' && (
          <PredictionHistory
            predictions={predictionsList}
            matches={matchMap}
          />
        )}
      </main>

      {/* Prediction Modal */}
      {predictingMatch && (
        <PredictionModal
          match={predictingMatch}
          availableBalance={balance}
          onSubmit={handleSubmitPrediction}
          onClose={() => setPredictingMatch(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="toast">
          <span className="toast-icon">✅</span>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;