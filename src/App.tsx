import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<Participant | null>(() => {
    const saved = localStorage.getItem('wc2026_user');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });

  const [currentPage, setCurrentPage] = useState('dashboard');
  const [predictingMatch, setPredictingMatch] = useState<Match | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // --- REACT QUERY: PUBLIC DATA ---
  
  const { data: participants = DEMO_PARTICIPANTS } = useQuery({
    queryKey: ['participants'],
    queryFn: async () => {
      const { data } = await supabase.from('participants').select('id, name, display_name, photo_url, pin').eq('is_active', true).order('name');
      return (data as Participant[]) || [];
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      console.log("[App.tsx] Initiating fetch for matches from Supabase...");
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .order('kickoff_utc');
      if (error) {
        console.error("[App.tsx] Supabase Error fetching matches:", error.message, error.details);
      }
      console.log(`[App.tsx] Matches query finished. Received ${data?.length || 0} rows. Sample row:`, data?.[0]);
      return (data as Match[]) || [];
    },
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: async () => {
      // Ideally this hits a leaderboard_view. For now, doing the joined select:
      const { data } = await supabase.from('wallets').select('balance, participant_id, in_play, participants ( name, display_name, photo_url )').order('balance', { ascending: false });
      if (!data) return [];
      return data.map((w: any, index: number) => ({
        participant_id: w.participant_id,
        name: w.participants.name,
        display_name: w.participants.display_name,
        photo_url: w.participants.photo_url,
        balance: w.balance,
        rank: index + 1,
      }));
    },
  });

  // --- REACT QUERY: USER DATA ---

  const { data: userData } = useQuery({
    queryKey: ['userData', currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const [
        { data: wallet },
        { data: preds }
      ] = await Promise.all([
        supabase.from('wallets').select('balance, in_play').eq('participant_id', currentUser!.id).single(),
        supabase.from('predictions').select('id, participant_id, match_id, prediction, stake, status, payout, submitted_at, updated_at').eq('participant_id', currentUser!.id)
      ]);
      
      const predMap = new Map<string, Prediction>();
      if (preds) preds.forEach(p => predMap.set(p.match_id, p));

      return {
        balance: wallet?.balance ?? 1000000,
        inPlay: wallet?.in_play ?? 0,
        predictions: predMap
      };
    }
  });

  const balance = userData?.balance ?? 1000000;
  const inPlay = userData?.inPlay ?? 0;
  const predictions = userData?.predictions ?? new Map<string, Prediction>();

  // --- REALTIME SUBSCRIPTIONS ---
  useEffect(() => {
    const channel = supabase.channel('app-realtime')
      // Listen for match updates (scores, status)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      })
      // Listen for wallet updates (if we are logged in) to see payouts live
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        if (currentUser) {
          queryClient.invalidateQueries({ queryKey: ['userData', currentUser.id] });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, currentUser]);


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

    // Optimistic Update
    const optimisticPrediction: Prediction = {
      id: `temp-${Date.now()}`,
      participant_id: currentUser.id,
      match_id: matchId,
      prediction: prediction as Prediction['prediction'],
      stake,
      status: 'PENDING',
      payout: null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    queryClient.setQueryData(['userData', currentUser.id], (old: any) => {
      if (!old) return old;
      const nextPreds = new Map(old.predictions);
      nextPreds.set(matchId, optimisticPrediction);
      return {
        ...old,
        balance: old.balance - stake,
        inPlay: old.inPlay + stake,
        predictions: nextPreds
      };
    });

    const { data, error } = await supabase.rpc('place_prediction', {
      p_participant_id: currentUser.id,
      p_match_id: matchId,
      p_prediction: prediction,
      p_stake: stake
    });

    if (error || !data || !data.success) {
      console.error("RPC Failed:", error || data?.error);
      // Rollback on error
      queryClient.invalidateQueries({ queryKey: ['userData', currentUser.id] });
      showToast(error ? 'Error placing prediction: ' + error.message : 'Failed: ' + (data?.error || 'Unknown error'));
      return;
    }

    // Success! Update local state with real ID and actual returned balance
    queryClient.setQueryData(['userData', currentUser.id], (old: any) => {
      if (!old) return old;
      const nextPreds = new Map(old.predictions);
      const updatedPred = { ...optimisticPrediction, id: data.prediction_id };
      nextPreds.set(matchId, updatedPred);
      return {
        ...old,
        balance: data.new_balance,
        // keep inPlay as is, it's correct from optimistic
        predictions: nextPreds
      };
    });

    queryClient.invalidateQueries({ queryKey: ['leaderboard'] }); // update our balance in leaderboard too

    const matchObj = matches.find(m => m.id === matchId);
    const teamName = prediction.includes('HOME')
      ? matchObj?.home_team
      : prediction === 'DRAW' ? 'Draw'
      : matchObj?.away_team;
      
    showToast(`Prediction locked! Staked ${new Intl.NumberFormat('en-US').format(stake)} coins on ${teamName}.`);
  }, [currentUser, matches, queryClient]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  if (!currentUser) {
    return (
      <IdentitySelector
        participants={participants}
        onSelect={handleSelectIdentity}
      />
    );
  }

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

      {predictingMatch && (
        <PredictionModal
          match={predictingMatch}
          availableBalance={balance}
          onSubmit={handleSubmitPrediction}
          onClose={() => setPredictingMatch(null)}
        />
      )}

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