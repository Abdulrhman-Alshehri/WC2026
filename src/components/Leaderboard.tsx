import { LeaderboardEntry } from '../types';
import { formatCoins, getAvatarColor } from '../lib/data';

interface Props {
  entries: LeaderboardEntry[];
  currentParticipantId: string;
}

export default function Leaderboard({ entries, currentParticipantId }: Props) {
  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <h2>Leaderboard</h2>
        <p className="leaderboard-subtitle">Live rankings updated after every match</p>
      </div>

      {/* Top 3 Podium */}
      <div className="podium">
        {entries.slice(0, 3).map((entry, idx) => {
          const podiumClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : 'bronze';
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
          const avatarColor = getAvatarColor(entry.name);
          return (
            <div
              key={entry.participant_id}
              className={`podium-card ${podiumClass} ${entry.participant_id === currentParticipantId ? 'podium-you' : ''}`}
              style={{ order: idx === 0 ? 1 : idx === 1 ? 0 : 2 }}
            >
              <span className="podium-medal">{medal}</span>
              <div className="podium-avatar" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)` }}>
                {entry.photo_url ? (
                  <img src={entry.photo_url} alt={entry.name} />
                ) : (
                  <span>{entry.name.charAt(0)}</span>
                )}
              </div>
              <span className="podium-name">{entry.display_name || entry.name}</span>
              <span className="podium-balance">{formatCoins(entry.balance)}</span>
              {entry.delta !== undefined && entry.delta !== 0 && (
                <span className={`podium-delta ${entry.delta > 0 ? 'delta-up' : 'delta-down'}`}>
                  {entry.delta > 0 ? `↑${entry.delta}` : `↓${Math.abs(entry.delta)}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Full List */}
      <div className="leaderboard-list">
        {entries.map((entry) => {
          const avatarColor = getAvatarColor(entry.name);
          const isYou = entry.participant_id === currentParticipantId;
          return (
            <div
              key={entry.participant_id}
              className={`leaderboard-row ${isYou ? 'leaderboard-you' : ''}`}
            >
              <span className="lb-rank">{entry.rank}</span>
              <div className="lb-avatar" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)` }}>
                {entry.photo_url ? (
                  <img src={entry.photo_url} alt={entry.name} />
                ) : (
                  <span>{entry.name.charAt(0)}</span>
                )}
              </div>
              <span className="lb-name">
                {entry.display_name || entry.name}
                {isYou && <span className="lb-you-tag">YOU</span>}
              </span>
              <span className="lb-balance">{formatCoins(entry.balance)}</span>
              {entry.delta !== undefined && entry.delta !== 0 && (
                <span className={`lb-delta ${entry.delta > 0 ? 'delta-up' : 'delta-down'}`}>
                  {entry.delta > 0 ? `↑${entry.delta}` : `↓${Math.abs(entry.delta)}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
