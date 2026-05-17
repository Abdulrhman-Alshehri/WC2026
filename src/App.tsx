import { useState, useCallback, useEffect } from 'react';
import { Participant, Match, Prediction, LeaderboardEntry } from './types';
import { DEMO_PARTICIPANTS } from './lib/data';
import { supabase } from './lib/supabase';
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
  const [participants, setParticipants] = useState<Participant[]>(DEMO_PARTICIPANTS);
  const [matches, setMatches] = useState<Match[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Load public data on mount
  useEffect(() => {
    async function loadPublicData() {
      // Fetch participants
      const { data: pData } = await supabase.from('participants').select('*').eq('is_active', true).order('name');
      if (pData && pData.length > 0) setParticipants(pData as Participant[]);

      // Fetch matches
      const { data: mData } = await supabase.from('matches').select('*').order('kickoff_utc');
      if (mData) setMatches(mData as Match[]);

      // Fetch leaderboard (wallets joined with participants)
      const { data: wData } = await supabase
        .from('wallets')
        .select(`
          balance,
          participant_id,
          participants ( name, display_name, photo_url )
        `)
        .order('balance', { ascending: false });

      if (wData) {
        const lb: LeaderboardEntry[] = wData.map((w: any, index: number) => ({
          participant_id: w.participant_id,
          name: w.participants.name,
          display_name: w.participants.display_name,
          photo_url: w.participants.photo_url,
          balance: w.balance,
          rank: index + 1,
        }));
        setLeaderboard(lb);
      }
    }
    loadPublicData();
  }, []);

  // Load user specific data when logged in
  useEffect(() => {
    if (!currentUser) return;
    
    async function loadUserData() {
      // Load wallet
      const { data: wallet } = await supabase.from('wallets').select('*').eq('participant_id', currentUser.id).single();
      if (wallet) {
        setBalance(wallet.balance);
        setInPlay(wallet.in_play);
      }
      
      // Load predictions
      const { data: preds } = await supabase.from('predictions').select('*').eq('participant_id', currentUser.id);
      if (preds) {
        const predMap = new Map<string, Prediction>();
        preds.forEach(p => predMap.set(p.match_id, p));
        setPredictions(predMap);
      }
    }
    loadUserData();
  }, [currentUser]);

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

  const handleSubmitPrediction = useCallback(async (matchId: string, prediction: string, stake: number) => {
    if (!currentUser) return;
    
    setPredictingMatch(null);
    showToast('Processing prediction...');

    const { data, error } = await supabase.rpc('place_prediction', {
      p_participant_id: currentUser.id,
      p_match_id: matchId,
      p_prediction: prediction,
      p_stake: stake
    });

    if (error) {
      showToast('Error placing prediction: ' + error.message);
      return;
    }

    if (!data.success) {
      showToast('Failed: ' + data.error);
      return;
    }

    // Success! Update local state
    setBalance(data.new_balance);
    setInPlay(prev => prev + stake);
    
    const newPrediction: Prediction = {
      id: data.prediction_id,
      participant_id: currentUser.id,
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

    const matchObj = matches.find(m => m.id === matchId);
    const teamName = prediction.includes('HOME')
      ? matchObj?.home_team
      : prediction === 'DRAW' ? 'Draw'
      : matchObj?.away_team;
      
    showToast(`Prediction locked! Staked ${new Intl.NumberFormat('en-US').format(stake)} coins on ${teamName}.`);
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