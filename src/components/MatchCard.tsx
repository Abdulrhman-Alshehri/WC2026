import { Match, Prediction } from '../types';
import { getFlagEmoji, getMatchStatusLabel, isPredictionWindowOpen, isKnockoutStage } from '../lib/data';

interface Props {
  match: Match;
  prediction?: Prediction;
  onPredict: (match: Match) => void;
}

export default function MatchCard({ match, prediction, onPredict }: Props) {
  const isLive = match.status === 'LIVE' || match.status === 'HT';
  const isFinished = match.status === 'FT' || match.status === 'AET' || match.status === 'PEN';
  const windowOpen = isPredictionWindowOpen(match);
  const knockout = isKnockoutStage(match.stage);

  const kickoffDate = new Date(match.kickoff_utc);
  const dateStr = kickoffDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = kickoffDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const predictionLabel = prediction ? (
    prediction.status === 'WON' ? 'WON' :
    prediction.status === 'LOST' ? 'LOST' :
    prediction.status === 'VOID' ? 'VOID' : 'PENDING'
  ) : null;

  return (
    <div className={`match-card ${isLive ? 'match-live' : ''} ${isFinished ? 'match-finished' : ''}`}>
      {/* Status bar */}
      <div className="match-card-header">
        <span className="match-stage">
          {match.group_name ? `Group ${match.group_name}` : match.stage}
        </span>
        <span className={`match-status-badge ${isLive ? 'status-live' : isFinished ? 'status-ft' : 'status-ns'}`}>
          {isLive && <span className="live-pulse" />}
          {getMatchStatusLabel(match.status)}
        </span>
      </div>

      {/* Teams and Score */}
      <div className="match-card-body">
        <div className="match-team home">
          <span className="team-flag">{getFlagEmoji(match.home_team_code)}</span>
          <span className="team-name">{match.home_team}</span>
        </div>

        <div className="match-score-area">
          {isLive || isFinished ? (
            <div className="match-score">
              <span>{match.home_score}</span>
              <span className="score-divider">-</span>
              <span>{match.away_score}</span>
            </div>
          ) : (
            <div className="match-time-info">
              <span className="match-date">{dateStr}</span>
              <span className="match-kickoff">{timeStr}</span>
            </div>
          )}
        </div>

        <div className="match-team away">
          <span className="team-name">{match.away_team}</span>
          <span className="team-flag">{getFlagEmoji(match.away_team_code)}</span>
        </div>
      </div>

      {/* Prediction / Action area */}
      <div className="match-card-footer">
        {prediction ? (
          <div className={`prediction-badge prediction-${prediction.status.toLowerCase()}`}>
            <span className="prediction-choice">
              {prediction.prediction === 'HOME_WIN' || prediction.prediction === 'HOME_ADVANCE'
                ? match.home_team
                : prediction.prediction === 'AWAY_WIN' || prediction.prediction === 'AWAY_ADVANCE'
                ? match.away_team
                : 'Draw'}
            </span>
            <span className="prediction-stake">
              {new Intl.NumberFormat('en-US').format(prediction.stake)} coins
            </span>
            {predictionLabel && predictionLabel !== 'PENDING' && (
              <span className={`prediction-result result-${predictionLabel.toLowerCase()}`}>
                {predictionLabel}
                {prediction.payout != null && predictionLabel === 'WON' && (
                  <> +{new Intl.NumberFormat('en-US').format(prediction.payout - prediction.stake)}</>
                )}
              </span>
            )}
          </div>
        ) : windowOpen ? (
          <button
            className="btn-predict"
            onClick={() => onPredict(match)}
          >
            {knockout ? 'Predict Winner' : 'Make Prediction'}
          </button>
        ) : !isFinished ? (
          <div className="prediction-locked">
            <span className="lock-icon">🔒</span>
            <span>No prediction made</span>
          </div>
        ) : (
          <div className="prediction-missed">
            <span>No prediction</span>
          </div>
        )}
      </div>
    </div>
  );
}
