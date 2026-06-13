import { Match, Prediction } from '../types';
import { getFlagEmoji, getMatchStatusLabel, isPredictionWindowOpen, isKnockoutStage } from '../lib/data';
import { Lock } from 'lucide-react';

interface Props {
  match: Match;
  prediction?: Prediction;
  onPredict: (match: Match) => void;
  onCancelPrediction?: (predictionId: string) => void;
  onShowPredictions?: (match: Match) => void;
}

export default function MatchCard({ match, prediction, onPredict, onCancelPrediction, onShowPredictions }: Props) {
  const isLive = match.status === 'LIVE' || match.status === 'HT';
  const isFinished = match.status === 'FT' || match.status === 'AET' || match.status === 'PEN';
  const windowOpen = isPredictionWindowOpen(match);
  const knockout = isKnockoutStage(match.stage);

  const kickoffDate = new Date(match.kickoff_utc);
  const dateStr = kickoffDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = kickoffDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const predictionLabel = prediction ? (prediction.status === 'WON' ? 'WON' : prediction.status === 'LOST' ? 'LOST' : prediction.status === 'VOID' ? 'VOID' : 'PENDING') : null;

  return (
    <div className={`match-card ${isLive ? 'match-live' : ''} ${isFinished ? 'match-finished' : ''}`}>
      <div className="match-card-header">
        <span className="match-stage">{match.group_name ? `Group ${match.group_name}` : match.stage}</span>
        <span className={`match-status-badge ${isLive ? 'status-live' : isFinished ? 'status-ft' : 'status-ns'}`}>
          {isLive && <span className="live-pulse" />}
          {getMatchStatusLabel(match.status)}
        </span>
      </div>

      <div className="match-card-body">
        <div className="match-team home">
          {match.home_logo_url ? <img src={match.home_logo_url} alt={match.home_team} className="team-logo-img" style={{ width: '28px', height: '28px', objectFit: 'contain', marginRight: '8px' }} /> : <span className="team-flag">{getFlagEmoji(match.home_team_code)}</span>}
          <span className="team-name">{match.home_team}</span>
        </div>

        <div className="match-score-area">
          {isLive || isFinished ? (
            <div className="match-score"><span>{match.home_score}</span><span className="score-divider">-</span><span>{match.away_score}</span></div>
          ) : (
            <div className="match-time-info"><span className="match-date">{dateStr}</span><span className="match-kickoff">{timeStr}</span></div>
          )}
        </div>

        <div className="match-team away">
          <span className="team-name">{match.away_team}</span>
          {match.away_logo_url ? <img src={match.away_logo_url} alt={match.away_team} className="team-logo-img" style={{ width: '28px', height: '28px', objectFit: 'contain', marginLeft: '8px' }} /> : <span className="team-flag">{getFlagEmoji(match.away_team_code)}</span>}
        </div>
      </div>

      <div className="match-card-footer">
        {isFinished ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '8px' }}>
            {prediction ? (
              <div className={`prediction-badge prediction-${prediction.status.toLowerCase()}`}>
                <span className="prediction-choice">
                  {prediction.prediction === 'HOME_WIN' || prediction.prediction === 'HOME_ADVANCE' ? match.home_team : prediction.prediction === 'AWAY_WIN' || prediction.prediction === 'AWAY_ADVANCE' ? match.away_team : 'Draw'}
                </span>
                <span className="prediction-stake">{new Intl.NumberFormat('en-US').format(prediction.stake)} coins</span>
                {predictionLabel && predictionLabel !== 'PENDING' && (
                  <span className={`prediction-result result-${predictionLabel.toLowerCase()}`}>
                    {predictionLabel}
                    {prediction.payout != null && predictionLabel === 'WON' && <> +{new Intl.NumberFormat('en-US').format(prediction.payout - prediction.stake)}</>}
                  </span>
                )}
              </div>
            ) : (
              <div className="prediction-missed"><span>No prediction</span></div>
            )}
            <button className="btn-view-predictions" onClick={() => onShowPredictions?.(match)}>
              View Predictions
            </button>
          </div>
        ) : prediction ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div className={`prediction-badge prediction-${prediction.status.toLowerCase()}`}>
              <span className="prediction-choice">
                {prediction.prediction === 'HOME_WIN' || prediction.prediction === 'HOME_ADVANCE' ? match.home_team : prediction.prediction === 'AWAY_WIN' || prediction.prediction === 'AWAY_ADVANCE' ? match.away_team : 'Draw'}
              </span>
              <span className="prediction-stake">{new Intl.NumberFormat('en-US').format(prediction.stake)} coins</span>
            </div>
            {windowOpen && prediction.status === 'PENDING' && (
              <div className="prediction-actions">
                <button className="btn-predict-edit" onClick={() => onPredict(match)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Edit
                </button>
                <button className="btn-predict-cancel" onClick={() => onCancelPrediction?.(prediction.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ) : windowOpen ? (
          <button className="btn-predict" onClick={() => onPredict(match)}>{knockout ? 'Predict Winner' : 'Make Prediction'}</button>
        ) : (
          <div className="prediction-locked"><Lock size={14} className="lock-icon" /><span>No prediction made</span></div>
        )}
      </div>
    </div>
  );
}
