import { useState, useEffect } from 'react';
import { Match, Prediction } from '../types';
import { supabase } from '../lib/supabase';
import { X, Coins, Loader2 } from 'lucide-react';
import { getFlagEmoji, formatCoins } from '../lib/data';

interface Props {
  match: Match | null;
  onClose: () => void;
}

interface PredictionWithParticipant extends Prediction {
  participants?: {
    name: string;
    display_name: string | null;
    photo_url: string | null;
  };
}

// Deterministic seed reaction counts based on prediction ID
function getSeedReactions(predictionId: string): Record<string, number> {
  let hash = 0;
  for (let i = 0; i < predictionId.length; i++) {
    hash = predictionId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return {
    '👍': Math.abs((hash >> 2) % 6),
    '❤️': Math.abs((hash >> 6) % 5),
    '😂': Math.abs((hash >> 10) % 8),
  };
}

export default function PredictionsViewerModal({ match, onClose }: Props) {
  const [predictions, setPredictions] = useState<PredictionWithParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  // Load user's local reactions from localStorage
  const [myReactions, setMyReactions] = useState<Record<string, string[]>>(() => {
    const saved = localStorage.getItem('wc2026_my_prediction_reactions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  });

  // Fetch all predictions on this match when the modal mounts
  useEffect(() => {
    if (!match) return;

    async function fetchPredictions() {
      setLoading(true);
      try {
        const { data: preds, error: predsError } = await supabase
          .from('predictions')
          .select('*, participants(name, display_name, photo_url)')
          .eq('match_id', match!.id);

        if (predsError) throw predsError;

        setPredictions((preds as any[]) || []);
      } catch (err) {
        console.error('Error loading predictions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchPredictions();
  }, [match]);

  // Handle toggling reaction
  const handleToggleReaction = (predictionId: string, emoji: string) => {
    const currentReactions = myReactions[predictionId] || [];
    let updatedReactions: string[];

    if (currentReactions.includes(emoji)) {
      updatedReactions = currentReactions.filter((e) => e !== emoji);
    } else {
      updatedReactions = [...currentReactions, emoji];
    }

    const nextState = {
      ...myReactions,
      [predictionId]: updatedReactions,
    };

    setMyReactions(nextState);
    localStorage.setItem('wc2026_my_prediction_reactions', JSON.stringify(nextState));
  };

  if (!match) return null;

  return (
    <div className="predictions-modal-overlay" onClick={onClose}>
      <div className="predictions-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="predictions-modal-header">
          <div className="predictions-modal-title-block">
            <h3 className="predictions-modal-title">Match Predictions</h3>
            <p className="predictions-modal-subtitle">
              {match.home_team} vs {match.away_team}
            </p>
          </div>
          <button className="predictions-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Match Result Summary */}
        <div className="predictions-modal-summary">
          <div className="summary-team home">
            {match.home_logo_url ? (
              <img src={match.home_logo_url} alt={match.home_team} className="summary-logo" />
            ) : (
              <span className="summary-flag">{getFlagEmoji(match.home_team_code)}</span>
            )}
            <span className="summary-name">{match.home_team}</span>
          </div>

          <div className="summary-score-box">
            <span className="summary-score">{match.home_score}</span>
            <span className="summary-score-divider">-</span>
            <span className="summary-score">{match.away_score}</span>
          </div>

          <div className="summary-team away">
            <span className="summary-name">{match.away_team}</span>
            {match.away_logo_url ? (
              <img src={match.away_logo_url} alt={match.away_team} className="summary-logo" />
            ) : (
              <span className="summary-flag">{getFlagEmoji(match.away_team_code)}</span>
            )}
          </div>
        </div>

        {/* Modal Body / Predictions List */}
        <div className="predictions-modal-body">
          {loading ? (
            <div className="predictions-loading">
              <Loader2 size={32} className="spinning" />
              <span>Gathering predictions...</span>
            </div>
          ) : predictions.length === 0 ? (
            <div className="predictions-empty">
              <span>No predictions were made on this match.</span>
            </div>
          ) : (
            <div className="predictions-list">
              {predictions.map((pred) => {
                const displayName = pred.participants?.display_name || pred.participants?.name || 'Unknown User';
                const hasAvatar = !!pred.participants?.photo_url;
                const seed = getSeedReactions(pred.id);
                const localUserReacts = myReactions[pred.id] || [];

                // Format outcome labels & styling
                const isWon = pred.status === 'WON';
                const isLost = pred.status === 'LOST';
                const profit = isWon && pred.payout ? pred.payout - pred.stake : 0;

                const choiceText =
                  pred.prediction === 'HOME_WIN' || pred.prediction === 'HOME_ADVANCE'
                    ? match.home_team
                    : pred.prediction === 'AWAY_WIN' || pred.prediction === 'AWAY_ADVANCE'
                    ? match.away_team
                    : 'Draw';

                return (
                  <div key={pred.id} className={`prediction-row-card ${pred.status.toLowerCase()}`}>
                    {/* User profile section */}
                    <div className="pred-row-user">
                      <div className="pred-row-avatar">
                        {hasAvatar ? (
                          <img src={pred.participants?.photo_url!} alt={displayName} />
                        ) : (
                          displayName.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="pred-row-details">
                        <span className="pred-row-name">{displayName}</span>
                        <span className="pred-row-choice">
                          Predicted: <strong className="choice-highlight">{choiceText}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Stake & Outcome badge section */}
                    <div className="pred-row-financial">
                      <div className="pred-row-badge-stack">
                        <span className={`pred-status-pill ${pred.status.toLowerCase()}`}>
                          {pred.status}
                          {isWon && ` +${formatCoins(profit)}`}
                          {isLost && ` -${formatCoins(pred.stake)}`}
                        </span>
                        <span className="pred-row-stake">
                          <Coins size={12} className="coins-icon" />
                          {formatCoins(pred.stake)} staked
                        </span>
                      </div>
                    </div>

                    {/* Reactions section */}
                    <div className="pred-row-reactions">
                      {['👍', '❤️', '😂'].map((emoji) => {
                        const meReacted = localUserReacts.includes(emoji);
                        const displayCount = seed[emoji] + (meReacted ? 1 : 0);

                        return (
                          <button
                            key={emoji}
                            className={`pred-reaction-btn ${meReacted ? 'active' : ''}`}
                            onClick={() => handleToggleReaction(pred.id, emoji)}
                          >
                            <span className="reaction-emoji">{emoji}</span>
                            <span className="reaction-count">{displayCount}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
