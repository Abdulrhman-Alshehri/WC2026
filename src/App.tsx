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
import ChatHub from './components/Chat';
import PredictionsViewerModal from './components/PredictionsViewerModal';

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
  
  const { videoRef, isActive, isFastActive, navigateWithTransition, handleVideoEnded, playOnce } = usePageTransition({
    currentPage,
    onCommitPage: setCurrentPage,
  });

  const [predictingMatch, setPredictingMatch] = useState<Match | null>(null);
  const [activePredictionMatch, setActivePredictionMatch] = useState<Match | null>(null);
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
      const { data } = await supabase.from('participants').select('id, name, display_name, photo_url, telegram_user, telegram_chat_id, pin, is_active, created_at').eq('is_active', true).order('name');
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
      // 1. Query the blinded balance view (balance + in_play, never raw columns)
      const { data: viewData, error: viewError } = await supabase
        .from('leaderboard_view')
        .select('participant_id, name, display_name, photo_url, blinded_balance, rank');

      if (viewError) {
        console.error('[App.tsx] Error loading leaderboard view:', viewError.message);
      }

      // Fallback: if wallets are not yet initialized, show all participants at starting balance
      if (!viewData || viewData.length === 0) {
        const { data: fallbackParticipants } = await supabase
          .from('participants')
          .select('id, name, display_name, photo_url')
          .eq('is_active', true)
          .order('name');

        if (!fallbackParticipants) return [];
        return fallbackParticipants.map((p: any, idx: number) => ({
          participant_id: p.id,
          name: p.name,
          display_name: p.display_name,
          photo_url: p.photo_url,
          blinded_balance: 1000000,
          rank: idx + 1,
          delta: 0,
        })) as LeaderboardEntry[];
      }

      // 2. Fetch the latest leaderboard snapshot for rank-delta calculation
      const { data: snapshotRows } = await supabase
        .from('leaderboard_snapshots')
        .select('snapshot')
        .order('created_at', { ascending: false })
        .limit(1);

      const previousSnapshot = snapshotRows?.[0]?.snapshot as
        Array<{ participant_id: string; rank: number }> | undefined;

      // 3. Map view data with computed deltas
      return viewData.map((item: any) => {
        let delta = 0;
        if (previousSnapshot) {
          const prev = previousSnapshot.find(
            (s: any) => s.participant_id === item.participant_id
          );
          if (prev) {
            // Positive delta = climbed toward rank 1
            delta = prev.rank - item.rank;
          }
        }
        return {
          participant_id: item.participant_id,
          name: item.name,
          display_name: item.display_name,
          photo_url: item.photo_url,
          blinded_balance: item.blinded_balance,
          rank: item.rank,
          delta,
        } as LeaderboardEntry;
      });
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

  // Sync currentUser.telegram_chat_id from the participants query whenever it refreshes.
  // localStorage can be stale (e.g. user paired Telegram after the last login), so we
  // propagate any telegram_chat_id change from the live server data into currentUser.
  useEffect(() => {
    if (!currentUser) return;
    const fresh = participants.find(p => p.id === currentUser.id);
    if (!fresh || fresh.telegram_chat_id === currentUser.telegram_chat_id) return;
    const updated = { ...currentUser, telegram_chat_id: fresh.telegram_chat_id, telegram_user: fresh.telegram_user };
    setCurrentUser(updated);
    localStorage.setItem('wc2026_user', JSON.stringify(updated));
  // currentUser.id is stable; participants changes when the query refetches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, currentUser?.id]);

  // When the user returns to this tab (e.g. after pairing Telegram in the external app),
  // invalidate the participants cache so the sync above picks up the new telegram_chat_id.
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        queryClient.invalidateQueries({ queryKey: ['participants'] });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [queryClient]);


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

    // Trigger Telegram notification if user has paired bot
    if (currentUser.telegram_chat_id && matchObj) {
      console.log("[App.tsx] Triggering Telegram prediction_placed webhook...");
      supabase.functions.invoke('telegram-webhook', {
        body: {
          event: 'prediction_placed',
          chat_id: currentUser.telegram_chat_id,
          data: {
            match_id: matchId,
            stake: stake,
            home_team: matchObj.home_team,
            away_team: matchObj.away_team,
            home_team_code: matchObj.home_team_code ?? null,
            away_team_code: matchObj.away_team_code ?? null,
            prediction: prediction,
            balance: data.new_balance
          }
        }
      }).catch(err => console.error("[App.tsx] Failed to trigger Telegram prediction notification:", err));
    }
  }, [currentUser, matches, queryClient]);

  const handleEditPrediction = useCallback(async (matchId: string, predictionId: string, prediction: string, stake: number) => {
    console.log("[App.tsx] handleEditPrediction invoked:", { matchId, predictionId, prediction, stake, currentUser });
    if (!currentUser) return;

    // Capture old values before mutating anything
    const oldPred = predictions.get(matchId);
    const oldPrediction = oldPred?.prediction;
    const oldStake = oldPred?.stake;

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

    // Trigger Telegram notification if user has paired bot
    if (currentUser.telegram_chat_id && matchObj && oldPrediction !== undefined && oldStake !== undefined) {
      supabase.functions.invoke('telegram-webhook', {
        body: {
          event: 'prediction_updated',
          chat_id: currentUser.telegram_chat_id,
          data: {
            match_id: matchId,
            home_team: matchObj.home_team,
            away_team: matchObj.away_team,
            home_team_code: matchObj.home_team_code ?? null,
            away_team_code: matchObj.away_team_code ?? null,
            old_prediction: oldPrediction,
            new_prediction: prediction,
            old_stake: oldStake,
            new_stake: stake,
            balance: data.new_balance,
          },
        },
      }).catch(err => console.error("[App.tsx] Failed to trigger Telegram prediction_updated notification:", err));
    }
  }, [currentUser, matches, predictions, queryClient]);

  const handleCancelPrediction = useCallback(async (predictionId: string) => {
    if (!currentUser) return;
    
    // Find prediction details before it gets deleted from local cache/database
    const predObj = Array.from(predictions.values()).find(p => p.id === predictionId);
    const matchObj = predObj ? matches.find(m => m.id === predObj.match_id) : null;

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

        // Trigger Telegram notification if user has paired bot
        if (currentUser.telegram_chat_id && predObj && matchObj) {
          const refundBalance = balance + Number(predObj.stake);
          console.log("[App.tsx] Triggering Telegram prediction_cancelled webhook...");
          supabase.functions.invoke('telegram-webhook', {
            body: {
              event: 'prediction_cancelled',
              chat_id: currentUser.telegram_chat_id,
              data: {
                match_id: predObj.match_id,
                stake: predObj.stake,
                home_team: matchObj.home_team,
                away_team: matchObj.away_team,
                balance: refundBalance
              }
            }
          }).catch(err => console.error("[App.tsx] Failed to trigger Telegram cancellation notification:", err));
        }
      }
    });
  }, [currentUser, queryClient, predictions, balance, matches]);

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
        isFastActive={isFastActive}
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
            onShowPredictions={setActivePredictionMatch}
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
        {currentPage === 'chat' && (
          <ChatHub currentParticipantId={currentUser.id} participants={participants} />
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

      {activePredictionMatch && (
        <PredictionsViewerModal
          match={activePredictionMatch}
          onClose={() => setActivePredictionMatch(null)}
        />
      )}
      </div>
      )}
    </>
  );
}

export default App;
