import { Prediction, Match } from '../types';
import { formatCoins, getFlagEmoji } from '../lib/data';

interface Props {
  predictions: Prediction[];
  matches: Map<string, Match>;
}

export default function PredictionHistory({ predictions, matches }: Props) {
  const sorted = [...predictions].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  const wonCount = sorted.filter(p => p.status === 'WON').length;
  const lostCount = sorted.filter(p => p.status === 'LOST').length;
  const pendingCount = sorted.filter(p => p.status === 'PENDING').length;

  return (
    <div className="history-page">
      <div className="history-header">
        <h2>Prediction History</h2>
        <p className="history-subtitle">Your complete prediction record</p>
      </div>

      <div className="history-stats">
        <div className="history-stat stat-total">
          <span className="stat-value">{sorted.length}</span>
          <span className="stat-label">Total</span>
        </div>
        <div className="history-stat stat-won">
          <span className="stat-value">{wonCount}</span>
          <span className="stat-label">Won</span>
        </div>
        <div className="history-stat stat-lost">
          <span className="stat-value">{lostCount}</span>
          <span className="stat-label">Lost</span>
        </div>
        <div className="history-stat stat-pending">
          <span className="stat-value">{pendingCount}</span>
          <span className="stat-label">Pending</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="history-empty">
          <p>You haven't made any predictions yet.</p>
          <p>Head to the dashboard to start predicting!</p>
        </div>
      ) : (
        <div className="history-list">
          {sorted.map((pred) => {
            const match = matches.get(pred.match_id);
            if (!match) return null;

            const predTeam =
              pred.prediction === 'HOME_WIN' || pred.prediction === 'HOME_ADVANCE'
                ? match.home_team
                : pred.prediction === 'AWAY_WIN' || pred.prediction === 'AWAY_ADVANCE'
                ? match.away_team
                : 'Draw';

            const netGain = pred.payout != null ? pred.payout - pred.stake : null;

            return (
              <div key={pred.id} className={`history-card history-${pred.status.toLowerCase()}`}>
                <div className="history-card-top">
                  <div className="history-match-info">
                    {match.home_logo_url ? (
                      <img 
                        src={match.home_logo_url} 
                        alt={match.home_team} 
                        className="team-logo-img" 
                        style={{ width: '20px', height: '20px', objectFit: 'contain', marginRight: '6px' }} 
                      />
                    ) : (
                      <span className="history-flag">{getFlagEmoji(match.home_team_code)}</span>
                    )}
                    <span className="history-teams">{match.home_team} vs {match.away_team}</span>
                    {match.away_logo_url ? (
                      <img 
                        src={match.away_logo_url} 
                        alt={match.away_team} 
                        className="team-logo-img" 
                        style={{ width: '20px', height: '20px', objectFit: 'contain', marginLeft: '6px' }} 
                      />
                    ) : (
                      <span className="history-flag">{getFlagEmoji(match.away_team_code)}</span>
                    )}
                  </div>
                  <span className={`history-badge badge-${pred.status.toLowerCase()}`}>
                    {pred.status}
                  </span>
                </div>

                <div className="history-card-body">
                  <div className="history-detail">
                    <span className="detail-label">Your Pick</span>
                    <span className="detail-value">{predTeam}</span>
                  </div>
                  <div className="history-detail">
                    <span className="detail-label">Stake</span>
                    <span className="detail-value">{formatCoins(pred.stake)}</span>
                  </div>
                  {match.home_score != null && (
                    <div className="history-detail">
                      <span className="detail-label">Final Score</span>
                      <span className="detail-value">{match.home_score} - {match.away_score}</span>
                    </div>
                  )}
                  {netGain != null && (
                    <div className="history-detail">
                      <span className="detail-label">Net</span>
                      <span className={`detail-value ${netGain >= 0 ? 'value-positive' : 'value-negative'}`}>
                        {netGain >= 0 ? '+' : ''}{formatCoins(netGain)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="history-card-date">
                  {new Date(pred.submitted_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
