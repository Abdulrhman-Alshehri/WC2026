import { useState, useMemo } from 'react';
import { Match, Prediction } from '../types';
import { formatCoins } from '../lib/data';
import Countdown from './Countdown';
import MatchCard from './MatchCard';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, RefreshCw, Trophy, Zap } from 'lucide-react';

const TEAM_ISO_MAP: Record<string, string> = {
  POR: 'pt', MAR: 'ma', IRN: 'ir', PAR: 'py', SCO: 'gb-sct', COL: 'co', GER: 'de',
  IRQ: 'iq', AUT: 'at', KSA: 'sa', AUS: 'au', ALG: 'dz', GHA: 'gh', NZL: 'nz',
  PAN: 'pa', UZB: 'uz', URY: 'uy', URU: 'uy', JPN: 'jp', CPV: 'cv', TUR: 'tr',
  FRA: 'fr', HAI: 'ht', JOR: 'jo', BRA: 'br', RSA: 'za', ENG: 'gb-eng', SWE: 'se',
  CAN: 'ca', USA: 'us', KOR: 'kr', NOR: 'no', BEL: 'be', TUN: 'tn', CUW: 'cw',
  EGY: 'eg', NED: 'nl', CIV: 'ci', ECU: 'ec', COD: 'cd', BIH: 'ba', ESP: 'es',
  SEN: 'sn', QAT: 'qa', MEX: 'mx', CRO: 'hr', ARG: 'ar', CZE: 'cz', SUI: 'ch'
};

function getTeamFlagUrl(teamCode: string | null, logoUrl: string | null): string {
  if (logoUrl) return logoUrl;
  if (!teamCode) return '';
  const iso = TEAM_ISO_MAP[teamCode.toUpperCase()];
  if (!iso) return '';
  return `https://flagcdn.com/w320/${iso.toLowerCase()}.png`;
}

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
  const [syncing, setSyncing] = useState(false);
  const [syncBanner, setSyncBanner] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const now = Date.now();

  const upcomingMatches = useMemo(() => {
    return matches
      .filter(m => m.status === 'NS' && new Date(m.kickoff_utc).getTime() > now)
      .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());
  }, [matches, now]);

  const liveMatches = useMemo(() => matches.filter(m => m.status === 'LIVE' || m.status === 'HT'), [matches]);

  const finishedMatches = useMemo(() => {
    return matches
      .filter(m => ['FT', 'AET', 'PEN'].includes(m.status))
      .sort((a, b) => new Date(b.kickoff_utc).getTime() - new Date(a.kickoff_utc).getTime());
  }, [matches]);

  const nextMatch = upcomingMatches[0];
  const totalPredictions = predictions.size;
  const wins = Array.from(predictions.values()).filter(p => p.status === 'WON').length;
  const totalWinnings = Array.from(predictions.values())
    .filter(p => p.status === 'WON' && p.payout != null)
    .reduce((sum, p) => sum + (p.payout! - p.stake), 0);

  const groups: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  const knockoutRounds: { key: KnockoutRound; label: string }[] = [
    { key: 'R32', label: 'Round of 32' },
    { key: 'R16', label: 'Round of 16' },
    { key: 'QF', label: 'Quarter-finals' },
    { key: 'SF', label: 'Semi-finals' },
    { key: '3RD', label: 'Third Place' },
    { key: 'FINAL', label: 'Final' }
  ];

  const filteredGroupMatches = useMemo(() => {
    return matches
      .filter(m => m.stage === 'GROUP' && m.group_name === activeGroup)
      .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());
  }, [matches, activeGroup]);

  const filteredKnockoutMatches = useMemo(() => {
    return matches
      .filter(m => m.stage === activeKnockout)
      .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());
  }, [matches, activeKnockout]);

  const handleSyncMatches = async () => {
    setSyncing(true);
    setSyncBanner(null);
    try {
      const { data, error } = await supabase.functions.invoke('sync-scores', { method: 'POST', body: {} });
      if (error) throw error;

      if (data && data.success) {
        setSyncBanner({ type: 'success', message: data.message || 'Successfully synchronized matches and scores!' });
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      } else {
        setSyncBanner({ type: 'error', message: data?.message || 'Failed to synchronize matches.' });
      }
    } catch (err: any) {
      setSyncBanner({ type: 'error', message: `Failed to trigger live matches sync: ${err.message || 'Unknown network error'}` });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="dashboard-page">
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
            <div className="hero-flag-container home">
              <img 
                src={getTeamFlagUrl(nextMatch.home_team_code, nextMatch.home_logo_url)} 
                alt={nextMatch.home_team} 
                className="hero-flag-img" 
              />
            </div>
            <div className="hero-countdown-details">
              <h2 className="hero-title">Next Match</h2>
              <div className="hero-match-preview">
                <span>{nextMatch.home_team}</span>
                <span className="hero-vs">vs</span>
                <span>{nextMatch.away_team}</span>
              </div>
              <Countdown targetDate={nextMatch.kickoff_utc} label="Kickoff in" />
            </div>
            <div className="hero-flag-container away">
              <img 
                src={getTeamFlagUrl(nextMatch.away_team_code, nextMatch.away_logo_url)} 
                alt={nextMatch.away_team} 
                className="hero-flag-img" 
              />
            </div>
          </div>
        ) : (
          <div className="hero-complete">
            <h2>Tournament Complete!</h2>
            <p>All matches have been played.</p>
          </div>
        )}

        <div className="hero-stats">
          <div className="hero-stat hero-stat-predictions">
            <span className="stat-value">{totalPredictions}</span>
            <span className="stat-label">Predictions</span>
          </div>
          <div className="hero-stat hero-stat-wins">
            <span className="stat-value">{wins}</span>
            <span className="stat-label">Wins</span>
          </div>
          <div className="hero-stat hero-stat-net">
            <span className="stat-value">{totalWinnings > 0 ? '+' : ''}{formatCoins(totalWinnings)}</span>
            <span className="stat-label">Net Profit</span>
          </div>
        </div>
      </section>

      {syncBanner && (
        <div className={`sync-notification-banner ${syncBanner.type}`}>
          <div className="sync-notification-content">
            <span className="sync-notification-icon">{syncBanner.type === 'success' ? '?' : syncBanner.type === 'warning' ? '!' : '�'}</span>
            <span>{syncBanner.message}</span>
          </div>
          <button onClick={() => setSyncBanner(null)} className="sync-notification-close">�</button>
        </div>
      )}

      <div className="dashboard-nav-container">
        <div className="dashboard-tabs" role="tablist" aria-label="Dashboard views">
          <button className={`dashboard-tab ${activeMainTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveMainTab('dashboard')}>
            <Activity size={14} /> Live & Highlights
          </button>
          <button className={`dashboard-tab ${activeMainTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveMainTab('groups')}>
            <Trophy size={14} /> Group Stage
          </button>
          <button className={`dashboard-tab ${activeMainTab === 'knockouts' ? 'active' : ''}`} onClick={() => setActiveMainTab('knockouts')}>
            <Zap size={14} /> Knockout Rounds
          </button>
        </div>

        <button onClick={handleSyncMatches} disabled={syncing} className="btn-sync">
          <RefreshCw size={14} className={syncing ? 'spinning' : ''} />
          {syncing ? 'Syncing...' : 'Sync Live Scores'}
        </button>
      </div>

      {activeMainTab === 'dashboard' && (
        <div className="dashboard-view-stack">
          {liveMatches.length > 0 && (
            <section className="match-section">
              <h3 className="section-title"><span className="live-pulse" />Live Matches</h3>
              <div className="match-grid">
                {liveMatches.map(m => <MatchCard key={m.id} match={m} prediction={predictions.get(m.id)} onPredict={onPredict} onCancelPrediction={onCancelPrediction} />)}
              </div>
            </section>
          )}

          {upcomingMatches.length > 0 && (
            <section className="match-section">
              <h3 className="section-title">Upcoming Fixtures</h3>
              <div className="match-grid">
                {upcomingMatches.slice(0, 6).map(m => <MatchCard key={m.id} match={m} prediction={predictions.get(m.id)} onPredict={onPredict} onCancelPrediction={onCancelPrediction} />)}
              </div>
            </section>
          )}

          {finishedMatches.length > 0 && (
            <section className="match-section">
              <h3 className="section-title">Recent Results</h3>
              <div className="match-grid">
                {finishedMatches.slice(0, 6).map(m => <MatchCard key={m.id} match={m} prediction={predictions.get(m.id)} onPredict={onPredict} onCancelPrediction={onCancelPrediction} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {activeMainTab === 'groups' && (
        <div className="dashboard-view-stack compact">
          <div className="group-selector-grid">
            {groups.map(g => (
              <button key={g} onClick={() => setActiveGroup(g)} className={`group-pill ${activeGroup === g ? 'active' : ''}`}>{g}</button>
            ))}
          </div>
          <section className="match-section">
            <h3 className="section-title">Group {activeGroup} Fixtures</h3>
            {filteredGroupMatches.length > 0 ? (
              <div className="match-grid">
                {filteredGroupMatches.map(m => <MatchCard key={m.id} match={m} prediction={predictions.get(m.id)} onPredict={onPredict} onCancelPrediction={onCancelPrediction} />)}
              </div>
            ) : (
              <div className="state-card"><Zap size={20} />No fixtures found for Group {activeGroup}.</div>
            )}
          </section>
        </div>
      )}

      {activeMainTab === 'knockouts' && (
        <div className="dashboard-view-stack compact">
          <div className="knockout-selector">
            {knockoutRounds.map(r => (
              <button key={r.key} onClick={() => setActiveKnockout(r.key)} className={`knockout-pill ${activeKnockout === r.key ? 'active' : ''}`}>{r.label}</button>
            ))}
          </div>
          <section className="match-section">
            <h3 className="section-title">{knockoutRounds.find(r => r.key === activeKnockout)?.label} Matches</h3>
            {filteredKnockoutMatches.length > 0 ? (
              <div className="match-grid">
                {filteredKnockoutMatches.map(m => <MatchCard key={m.id} match={m} prediction={predictions.get(m.id)} onPredict={onPredict} onCancelPrediction={onCancelPrediction} />)}
              </div>
            ) : (
              <div className="state-card"><Trophy size={20} />No matches scheduled or unlocked for this round yet.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
