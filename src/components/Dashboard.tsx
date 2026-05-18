import { useState, useMemo } from 'react';
import { Match, Prediction } from '../types';
import { formatCoins } from '../lib/data';
import Countdown from './Countdown';
import MatchCard from './MatchCard';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  matches: Match[];
  predictions: Map<string, Prediction>;
  onPredict: (match: Match) => void;
  onCancelPrediction: (predictionId: string) => void;
}

type MainTab = 'dashboard' | 'groups' | 'knockouts';
type GroupLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';
type KnockoutRound = 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'FINAL';

export default function Dashboard({ matches, predictions, onPredict, onCancelPrediction }: Props) {
  const queryClient = useQueryClient();
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('dashboard');
  const [activeGroup, setActiveGroup] = useState<GroupLetter>('A');
  const [activeKnockout, setActiveKnockout] = useState<KnockoutRound>('R32');

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const now = Date.now();

  // Find next upcoming match for the hero countdown
  const upcomingMatches = useMemo(() => {
    return matches
      .filter(m => m.status === 'NS' && new Date(m.kickoff_utc).getTime() > now)
      .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());
  }, [matches, now]);

  const liveMatches = useMemo(() => {
    return matches.filter(m => m.status === 'LIVE' || m.status === 'HT');
  }, [matches]);

  const finishedMatches = useMemo(() => {
    return matches
      .filter(m => ['FT', 'AET', 'PEN'].includes(m.status))
      .sort((a, b) => new Date(b.kickoff_utc).getTime() - new Date(a.kickoff_utc).getTime()); // descending for recent results
  }, [matches]);

  const nextMatch = upcomingMatches[0];

  // Calculate prediction stats
  const totalPredictions = predictions.size;
  const wins = Array.from(predictions.values()).filter(p => p.status === 'WON').length;
  const totalWinnings = Array.from(predictions.values())
    .filter(p => p.status === 'WON' && p.payout != null)
    .reduce((sum, p) => sum + (p.payout! - p.stake), 0);

  // Group letters
  const groups: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  // Knockout rounds mapping
  const knockoutRounds: { key: KnockoutRound; label: string }[] = [
    { key: 'R32', label: 'Round of 32' },
    { key: 'R16', label: 'Round of 16' },
    { key: 'QF', label: 'Quarter-finals' },
    { key: 'SF', label: 'Semi-finals' },
    { key: '3RD', label: 'Third Place' },
    { key: 'FINAL', label: 'Final' }
  ];

  // Filter group matches
  const filteredGroupMatches = useMemo(() => {
    return matches
      .filter(m => m.stage === 'GROUP' && m.group_name === activeGroup)
      .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());
  }, [matches, activeGroup]);

  // Filter knockout matches
  const filteredKnockoutMatches = useMemo(() => {
    return matches
      .filter(m => m.stage === activeKnockout)
      .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());
  }, [matches, activeKnockout]);

  // Handle manual live data sync
  const handleSyncMatches = async () => {
    setSyncing(true);
    setSyncBanner(null);
    try {
      console.log('Invoking sync-scores Edge Function manually...');
      // Invoke the Supabase Edge Function securely
      const { data, error } = await supabase.functions.invoke('sync-scores', {
        method: 'POST',
        body: {}
      });

      if (error) throw error;

      console.log('sync-scores response data:', data);

      if (data && data.success) {
        setSyncBanner({ 
          type: 'success', 
          message: data.message || 'Successfully synchronized matches and scores!' 
        });
        // Invalidate react-query cache to refetch fresh matches from Supabase public.matches
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      } else {
        setSyncBanner({
          type: 'error',
          message: data?.message || 'Failed to synchronize matches.'
        });
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncBanner({
        type: 'error',
        message: `Failed to trigger live matches sync: ${err.message || 'Unknown network error'}`
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="dashboard-page">
      {/* Hero Section */}
      <section className="hero-section">
        {liveMatches.length > 0 ? (
          <div className="hero-live">
            <div className="hero-live-badge">
              <span className="live-pulse" />
              LIVE NOW
            </div>
            <p className="hero-live-count">{liveMatches.length} match{liveMatches.length > 1 ? 'es' : ''} in progress</p>
          </div>
        ) : nextMatch ? (
          <div className="hero-countdown-wrapper">
            <h2 className="hero-title">Next Match</h2>
            <div className="hero-match-preview">
              <span>{nextMatch.home_team}</span>
              <span className="hero-vs">vs</span>
              <span>{nextMatch.away_team}</span>
            </div>
            <Countdown targetDate={nextMatch.kickoff_utc} label="Kickoff in" />
          </div>
        ) : (
          <div className="hero-complete">
            <h2>Tournament Complete!</h2>
            <p>All matches have been played.</p>
          </div>
        )}

        {/* Quick Stats */}
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="stat-value">{totalPredictions}</span>
            <span className="stat-label">Predictions</span>
          </div>
          <div className="hero-stat">
            <span className="stat-value">{wins}</span>
            <span className="stat-label">Wins</span>
          </div>
          <div className="hero-stat">
            <span className="stat-value">{totalWinnings > 0 ? '+' : ''}{formatCoins(totalWinnings)}</span>
            <span className="stat-label">Net Profit</span>
          </div>
        </div>
      </section>

      {/* Sync Banner Notifications */}
      {syncBanner && (
        <div 
          className={`sync-notification-banner ${syncBanner.type}`}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius)',
            border: `2px solid ${
              syncBanner.type === 'success' ? 'var(--green)' : syncBanner.type === 'warning' ? '#ff9e81' : 'var(--red)'
            }`,
            background: syncBanner.type === 'success' ? '#eefdf3' : syncBanner.type === 'warning' ? '#fffaf0' : '#fdf2f2',
            color: syncBanner.type === 'success' ? '#006629' : syncBanner.type === 'warning' ? '#b23b00' : 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '0.85rem',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>
              {syncBanner.type === 'success' ? '✅' : syncBanner.type === 'warning' ? '⚠️' : '❌'}
            </span>
            <span>{syncBanner.message}</span>
          </div>
          <button 
            onClick={() => setSyncBanner(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              fontWeight: 'bold',
              fontSize: '1rem',
              padding: '0 4px'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Navigation Headers and Sync Trigger */}
      <div 
        className="dashboard-nav-container"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid var(--border)',
          paddingBottom: '8px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        {/* Main Tabs */}
        <div 
          className="dashboard-tabs" 
          style={{ display: 'flex', gap: '6px' }}
        >
          <button 
            className={`topnav-link ${activeMainTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('dashboard')}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              transition: 'all 0.2s',
              background: activeMainTab === 'dashboard' ? 'var(--accent)' : 'none',
              color: activeMainTab === 'dashboard' ? '#ffffff' : 'var(--text3)'
            }}
          >
            📊 Live & Highlights
          </button>
          <button 
            className={`topnav-link ${activeMainTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('groups')}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              transition: 'all 0.2s',
              background: activeMainTab === 'groups' ? 'var(--accent)' : 'none',
              color: activeMainTab === 'groups' ? '#ffffff' : 'var(--text3)'
            }}
          >
            🏆 Group Stage
          </button>
          <button 
            className={`topnav-link ${activeMainTab === 'knockouts' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('knockouts')}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              transition: 'all 0.2s',
              background: activeMainTab === 'knockouts' ? 'var(--accent)' : 'none',
              color: activeMainTab === 'knockouts' ? '#ffffff' : 'var(--text3)'
            }}
          >
            ⚡ Knockout Rounds
          </button>
        </div>

        {/* Sync Action Trigger */}
        <button
          onClick={handleSyncMatches}
          disabled={syncing}
          className="btn-sync"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--surface)',
            border: '2px solid var(--border)',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            color: 'var(--text)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            opacity: syncing ? 0.7 : 1
          }}
        >
          <span 
            style={{ 
              display: 'inline-block', 
              animation: syncing ? 'spin 1s linear infinite' : 'none' 
            }}
          >
            🔄
          </span>
          {syncing ? 'Syncing...' : 'Sync Live Scores'}
        </button>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>

      {/* Main Tab Views */}
      
      {/* View 1: Dashboard Home */}
      {activeMainTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Live Matches */}
          {liveMatches.length > 0 ? (
            <section className="match-section">
              <h3 className="section-title">
                <span className="live-pulse" />
                Live Matches
              </h3>
              <div className="match-grid">
                {liveMatches.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions.get(m.id)}
                    onPredict={onPredict}
                    onCancelPrediction={onCancelPrediction}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Next Upcoming Matches */}
          {upcomingMatches.length > 0 && (
            <section className="match-section">
              <h3 className="section-title">Upcoming Fixtures</h3>
              <div className="match-grid">
                {upcomingMatches.slice(0, 6).map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions.get(m.id)}
                    onPredict={onPredict}
                    onCancelPrediction={onCancelPrediction}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Recent Results */}
          {finishedMatches.length > 0 && (
            <section className="match-section">
              <h3 className="section-title">Recent Results</h3>
              <div className="match-grid">
                {finishedMatches.slice(0, 6).map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions.get(m.id)}
                    onPredict={onPredict}
                    onCancelPrediction={onCancelPrediction}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* View 2: Group Stage Explorer */}
      {activeMainTab === 'groups' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Sub Group selector buttons */}
          <div 
            className="group-selector-grid"
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '8px',
              scrollbarWidth: 'thin'
            }}
          >
            {groups.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  flex: '0 0 auto',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: `2px solid ${activeGroup === g ? 'var(--accent)' : 'var(--border)'}`,
                  background: activeGroup === g ? 'var(--accent)' : '#ffffff',
                  color: activeGroup === g ? '#ffffff' : 'var(--text)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
              >
                {g}
              </button>
            ))}
          </div>

          <section className="match-section">
            <h3 className="section-title">Group {activeGroup} Fixtures</h3>
            {filteredGroupMatches.length > 0 ? (
              <div className="match-grid">
                {filteredGroupMatches.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions.get(m.id)}
                    onPredict={onPredict}
                    onCancelPrediction={onCancelPrediction}
                  />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)', fontSize: '0.9rem' }}>
                No fixtures found for Group {activeGroup}.
              </div>
            )}
          </section>
        </div>
      )}

      {/* View 3: Knockout Rounds Explorer */}
      {activeMainTab === 'knockouts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Knockout Round Sub Tabs */}
          <div 
            className="knockout-selector"
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '8px',
              scrollbarWidth: 'thin'
            }}
          >
            {knockoutRounds.map(r => (
              <button
                key={r.key}
                onClick={() => setActiveKnockout(r.key)}
                style={{
                  flex: '0 0 auto',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: `2px solid ${activeKnockout === r.key ? 'var(--accent)' : 'var(--border)'}`,
                  background: activeKnockout === r.key ? 'var(--accent)' : '#ffffff',
                  color: activeKnockout === r.key ? '#ffffff' : 'var(--text)',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  transition: 'all 0.2s'
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <section className="match-section">
            <h3 className="section-title">
              {knockoutRounds.find(r => r.key === activeKnockout)?.label} Matches
            </h3>
            {filteredKnockoutMatches.length > 0 ? (
              <div className="match-grid">
                {filteredKnockoutMatches.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions.get(m.id)}
                    onPredict={onPredict}
                    onCancelPrediction={onCancelPrediction}
                  />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text3)', fontSize: '0.9rem' }}>
                No matches scheduled or unlocked for this round yet.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
