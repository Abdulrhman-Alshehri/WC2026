import { Match, Prediction } from '../types';
import { formatCoins } from '../lib/data';
import Countdown from './Countdown';
import MatchCard from './MatchCard';

interface Props {
  matches: Match[];
  predictions: Map<string, Prediction>;
  onPredict: (match: Match) => void;
}

export default function Dashboard({ matches, predictions, onPredict }: Props) {
  // Find next upcoming match for the hero countdown
  const now = Date.now();
  const upcomingMatches = matches
    .filter(m => m.status === 'NS' && new Date(m.kickoff_utc).getTime() > now)
    .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());

  const liveMatches = matches.filter(m => m.status === 'LIVE' || m.status === 'HT');
  const finishedMatches = matches.filter(m => ['FT', 'AET', 'PEN'].includes(m.status));

  const nextMatch = upcomingMatches[0];

  // Group upcoming matches by date
  const groupedUpcoming: Record<string, Match[]> = {};
  upcomingMatches.forEach(m => {
    const dateKey = new Date(m.kickoff_utc).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
    if (!groupedUpcoming[dateKey]) groupedUpcoming[dateKey] = [];
    groupedUpcoming[dateKey].push(m);
  });

  // Calculate prediction stats
  const totalPredictions = predictions.size;
  const wins = Array.from(predictions.values()).filter(p => p.status === 'WON').length;
  const totalWinnings = Array.from(predictions.values())
    .filter(p => p.status === 'WON' && p.payout != null)
    .reduce((sum, p) => sum + (p.payout! - p.stake), 0);

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

      {/* Live Matches */}
      {liveMatches.length > 0 && (
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
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Matches */}
      {Object.keys(groupedUpcoming).length > 0 && (
        <section className="match-section">
          <h3 className="section-title">Upcoming Matches</h3>
          {Object.entries(groupedUpcoming).map(([date, dateMatches]) => (
            <div key={date} className="match-date-group">
              <p className="match-date-header">{date}</p>
              <div className="match-grid">
                {dateMatches.map(m => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    prediction={predictions.get(m.id)}
                    onPredict={onPredict}
                  />
                ))}
              </div>
            </div>
          ))}
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
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
