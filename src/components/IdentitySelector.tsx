import { Participant } from '../types';
import { getAvatarColor } from '../lib/data';

interface Props {
  participants: Participant[];
  onSelect: (participant: Participant) => void;
}

export default function IdentitySelector({ participants, onSelect }: Props) {
  return (
    <div className="identity-selector">
      <div className="identity-bg-overlay" />
      <div className="identity-content">
        <div className="identity-header">
          <img src="/logo.jpg" alt="WC2026" className="identity-logo" />
          <h1 className="identity-title">WC 2026</h1>
          <p className="identity-subtitle">PREDICTION POOL</p>
          <p className="identity-desc">Select your identity to start predicting</p>
        </div>
        <div className="identity-grid">
          {participants.map((p) => {
            const color = getAvatarColor(p.name);
            return (
              <button
                key={p.id}
                className="identity-card"
                onClick={() => onSelect(p)}
              >
                <div className="identity-avatar" style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}>
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} />
                  ) : (
                    <span>{p.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="identity-name">{p.display_name || p.name}</span>
                <span className="identity-cta">Play as {p.display_name || p.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
