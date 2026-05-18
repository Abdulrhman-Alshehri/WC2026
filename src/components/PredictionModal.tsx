import { useState } from 'react';
import { Match } from '../types';
import { getFlagEmoji, formatCoins, isKnockoutStage } from '../lib/data';

interface Props {
  match: Match;
  availableBalance: number;
  onSubmit: (matchId: string, prediction: string, stake: number) => void;
  onClose: () => void;
}

export default function PredictionModal({ match, availableBalance, onSubmit, onClose }: Props) {
  const knockout = isKnockoutStage(match.stage);
  const [selected, setSelected] = useState<string | null>(null);
  const [stake, setStake] = useState<number>(Math.min(100000, availableBalance));
  const [confirming, setConfirming] = useState(false);

  const minStake = 1000;
  const maxStake = availableBalance;

  const options = knockout
    ? [
        { value: 'HOME_ADVANCE', label: `${match.home_team} advances`, flag: match.home_team_code },
        { value: 'AWAY_ADVANCE', label: `${match.away_team} advances`, flag: match.away_team_code },
      ]
    : [
        { value: 'HOME_WIN', label: match.home_team, flag: match.home_team_code },
        { value: 'DRAW', label: 'Draw', flag: null },
        { value: 'AWAY_WIN', label: match.away_team, flag: match.away_team_code },
      ];

  const handleConfirm = () => {
    console.log("[PredictionModal] Confirm Prediction clicked. State:", { selected, stake, minStake, maxStake, availableBalance });
    if (!selected || stake < minStake || stake > maxStake) {
      console.warn("[PredictionModal] Confirm aborted due to validation failure.");
      return;
    }
    setConfirming(true);
    setTimeout(() => {
      console.log("[PredictionModal] Confirming timeout finished. Submitting to app level...");
      onSubmit(match.id, selected, stake);
      setConfirming(false);
    }, 600);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="prediction-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>&times;</button>

        <div className="modal-header">
          <span className="modal-stage">
            {match.group_name ? `Group ${match.group_name}` : match.stage}
          </span>
          <h2 className="modal-title">Make Your Prediction</h2>
        </div>

        <div className="modal-matchup">
          <div className="modal-team">
            <span className="modal-flag">{getFlagEmoji(match.home_team_code)}</span>
            <span>{match.home_team}</span>
          </div>
          <span className="modal-vs">VS</span>
          <div className="modal-team">
            <span className="modal-flag">{getFlagEmoji(match.away_team_code)}</span>
            <span>{match.away_team}</span>
          </div>
        </div>

        <div className="modal-options">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`option-btn ${selected === opt.value ? 'option-selected' : ''}`}
              onClick={() => {
                console.log("[PredictionModal] Option selected:", opt.value, opt.label);
                setSelected(opt.value);
              }}
            >
              {opt.flag && <span className="option-flag">{getFlagEmoji(opt.flag)}</span>}
              <span className="option-label">{opt.label}</span>
            </button>
          ))}
        </div>

        <div className="modal-stake">
          <label className="stake-label">
            Stake Amount
            <span className="stake-available">Available: {formatCoins(availableBalance)}</span>
          </label>
          <input
            type="range"
            min={minStake}
            max={maxStake}
            step={1000}
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="stake-slider"
          />
          <div className="stake-display">
            <input
              type="number"
              value={stake}
              min={minStake}
              max={maxStake}
              step={1000}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val >= minStake && val <= maxStake) setStake(val);
              }}
              className="stake-input"
            />
            <span className="stake-coins">coins</span>
          </div>
          <div className="stake-presets">
            {[10, 25, 50, 100].map((pct) => (
              <button
                key={pct}
                className="stake-preset"
                onClick={() => setStake(Math.max(minStake, Math.floor(availableBalance * pct / 100 / 1000) * 1000))}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div className="modal-summary">
          {selected && (
            <p>
              Predicting <strong>
                {options.find(o => o.value === selected)?.label}
              </strong>. Staking <strong>{formatCoins(stake)}</strong> coins.
            </p>
          )}
        </div>

        <button
          className={`btn-confirm ${confirming ? 'confirming' : ''}`}
          disabled={!selected || stake < minStake || stake > maxStake || confirming}
          onClick={handleConfirm}
        >
          {confirming ? 'Locking Prediction...' : 'Confirm Prediction'}
        </button>
      </div>
    </div>
  );
}
