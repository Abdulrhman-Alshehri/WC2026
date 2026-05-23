import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import ConfirmModal from './components/ConfirmModal';
import TransitionOverlay from './components/TransitionOverlay';
import ProfileSettings from './components/ProfileSettings';
import { usePageTransition } from './hooks/usePageTransition';

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
  const [previousPage, setPreviousPage] = useState('dashboard');
  
  const { videoRef, isActive, navigateWithTransition, handleVideoEnded, playOnce } = usePageTransition({
    currentPage,
    onCommitPage: setCurrentPage,
  });

  const [predictingMatch, setPredictingMatch] = useState<Match | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // --- REACT QUERY: PUBLIC DATA ---
  
  const { data: participants = DEMO_PARTICIPANTS } = useQuery({
    queryKey: ['participants'],
    queryFn: async () => {
      const { data } = await supabase.from('participants').select('id, name, display_name, photo_url, telegram_user, pin, is_active, created_at').eq('is_active', true).order('name');
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
    playOnce(() => {
      setCurrentUser(participant);
      localStorage.setItem('wc2026_user', JSON.stringify(participant));
    });
  }, [playOnce]);

  // Intro reveal: play once as soon as the video is ready on first load
  const introPlayedRef = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tryIntro = () => {
      if (!introPlayedRef.current) {
        introPlayedRef.current = true;
        playOnce();
      }
    };
    if (video.readyState >= 3) {
      tryIntro();
    } else {
      video.addEventListener('canplay', tryIntro, { once: true });
      return () => video.removeEventListener('canplay', tryIntro);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem('wc2026_user');
  }, []);

  const handleOpenProfile = useCallback(() => {
    setPreviousPage(currentPage);
    navigateWithTransition('profile');
  }, [currentPage, navigateWithTransition]);

  const handleNavigate = useCallback((page: string) => {
    navigateWithTransition(page);
  }, [navigateWithTransition]);

  const handleOpenPredict = useCallback((match: Match) => {
    setPredictingMatch(match);
  }, []);

  const handleSubmitPrediction = useCallback(async (matchId: string, prediction: string, stake: number) => {
    console.log("[App.tsx] handleSubmitPrediction invoked:", { matchId, prediction, stake, currentUser });
    if (!currentUser) {
      console.warn("[App.tsx] Cannot submit prediction: no currentUser is set.");
      return;
    }
    
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

    console.log("[App.tsx] Applying optimistic update with payload:", optimisticPrediction);
    queryClient.setQueryData(['userData', currentUser.id], (old: any) => {
      if (!old) {
        console.warn("[App.tsx] No existing userData found in queryClient cache to optimistically update.");
        return old;
      }
      const nextPreds = new Map(old.predictions);
      nextPreds.set(matchId, optimisticPrediction);
      const nextData = {
        ...old,
        balance: old.balance - stake,
        inPlay: old.inPlay + stake,
        predictions: nextPreds
      };
      console.log("[App.tsx] Optimistic update state calculated:", nextData);
      return nextData;
    });

    console.log("[App.tsx] Invoking place_prediction RPC in Supabase...");
    const { data, error } = await supabase.rpc('place_prediction', {
      p_participant_id: currentUser.id,
      p_match_id: matchId,
      p_prediction: prediction,
      p_stake: stake
    });

    if (error || !data || !data.success) {
      console.error("[App.tsx] Supabase place_prediction RPC Failed! Details:", { error, data });
      // Rollback on error
      queryClient.invalidateQueries({ queryKey: ['userData', currentUser.id] });
      const errMsg = error ? error.message : (data?.error || 'Unknown error');
      showToast('Failed to place prediction: ' + errMsg);
      return;
    }

    console.log("[App.tsx] Supabase place_prediction RPC Succeeded! Response:", data);

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

    console.log("[App.tsx] Invalidating leaderboard queries to update ranks...");
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] }); // update our balance in leaderboard too

    const matchObj = matches.find(m => m.id === matchId);
    const teamName = prediction.includes('HOME')
      ? matchObj?.home_team
      : prediction === 'DRAW' ? 'Draw'
      : matchObj?.away_team;
      
    showToast(`Prediction locked! Staked ${new Intl.NumberFormat('en-US').format(stake)} coins on ${teamName}.`);
  }, [currentUser, matches, queryClient]);

  const handleEditPrediction = useCallback(async (matchId: string, predictionId: string, prediction: string, stake: number) => {
    console.log("[App.tsx] handleEditPrediction invoked:", { matchId, predictionId, prediction, stake, currentUser });
    if (!currentUser) return;
    
    setPredictingMatch(null);
    showToast('Updating prediction...');

    console.log("[App.tsx] Invoking update_prediction RPC in Supabase...");
    const { data, error } = await supabase.rpc('update_prediction', {
      p_prediction_id: predictionId,
      p_new_prediction: prediction,
      p_new_stake: stake
    });

    if (error || !data || !data.success) {
      console.error("[App.tsx] Supabase update_prediction RPC Failed! Details:", { error, data });
      showToast('Failed to update prediction: ' + (error ? error.message : (data?.error || 'Unknown error')));
      return;
    }

    console.log("[App.tsx] Supabase update_prediction RPC Succeeded! Response:", data);
    
    // Refresh user data from Supabase
    queryClient.invalidateQueries({ queryKey: ['userData', currentUser.id] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

    const matchObj = matches.find(m => m.id === matchId);
    const teamName = prediction.includes('HOME')
      ? matchObj?.home_team
      : prediction === 'DRAW' ? 'Draw'
      : matchObj?.away_team;
      
    showToast(`Prediction updated! New stake is ${new Intl.NumberFormat('en-US').format(stake)} coins on ${teamName}.`);
  }, [currentUser, matches, queryClient]);

  const handleCancelPrediction = useCallback(async (predictionId: string) => {
    if (!currentUser) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Prediction',
      message: 'Are you sure you want to cancel this prediction? Your full stake will be refunded to your balance instantly.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        showToast('Cancelling prediction...');

        console.log("[App.tsx] Invoking cancel_prediction RPC in Supabase...");
        const { data, error } = await supabase.rpc('cancel_prediction', {
          p_prediction_id: predictionId
        });

        if (error || !data || !data.success) {
          console.error("[App.tsx] Supabase cancel_prediction RPC Failed! Details:", { error, data });
          showToast('Failed to cancel prediction: ' + (error ? error.message : (data?.error || 'Unknown error')));
          return;
        }

        console.log("[App.tsx] Supabase cancel_prediction RPC Succeeded! Response:", data);

        // Refresh user data from Supabase
        queryClient.invalidateQueries({ queryKey: ['userData', currentUser.id] });
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
        
        showToast('Prediction cancelled successfully! Stake fully refunded.');
      }
    });
  }, [currentUser, queryClient]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  const matchMap = new Map(matches.map(m => [m.id, m]));
  const predictionsList = Array.from(predictions.values());

  return (
    <>
      <TransitionOverlay
        isActive={isActive}
        onEnded={handleVideoEnded}
        videoRef={videoRef}
      />
      {!currentUser ? (
        <IdentitySelector
          participants={participants}
          onSelect={handleSelectIdentity}
        />
      ) : (
      <div className="app">
      <TopNav
        participant={currentUser}
        balance={balance}
        inPlay={inPlay}
        onNavigate={handleNavigate}
        currentPage={currentPage}
        onOpenProfile={handleOpenProfile}
      />

      <main className="main-content">
        {currentPage === 'dashboard' && (
          <Dashboard
            matches={matches}
            predictions={predictions}
            onPredict={handleOpenPredict}
            onCancelPrediction={handleCancelPrediction}
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
            onNavigateToDashboard={() => handleNavigate('dashboard')}
          />
        )}
        {currentPage === 'profile' && (
          <ProfileSettings
            participant={currentUser}
            onProfileUpdated={(updated) => {
              setCurrentUser(updated);
              localStorage.setItem('wc2026_user', JSON.stringify(updated));
            }}
            onBack={() => handleNavigate(previousPage)}
            onLogout={handleLogout}
          />
        )}
      </main>

      {predictingMatch && (
        <PredictionModal
          match={predictingMatch}
          availableBalance={balance}
          existingPrediction={predictions.get(predictingMatch.id)}
          onSubmit={handleSubmitPrediction}
          onEdit={handleEditPrediction}
          onClose={() => setPredictingMatch(null)}
        />
      )}

      {toast && (
        <div className="toast">
          <span className="toast-icon">✅</span>
          {toast}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      </div>
      )}
    </>
  );
}

export default App;
