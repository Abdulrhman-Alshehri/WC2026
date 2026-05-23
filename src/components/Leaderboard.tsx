import { LeaderboardEntry } from '../types';
import { formatCoins, getAvatarColor } from '../lib/data';
import { TrendingDown, TrendingUp, Trophy, Coins } from 'lucide-react';

interface Props {
  entries: LeaderboardEntry[];
  currentParticipantId: string;
}

export default function Leaderboard({ entries, currentParticipantId }: Props) {
  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <div className="leaderboard-kicker">Trophy Rankings</div>
        <h2>Leaderboard</h2>
        <p className="leaderboard-subtitle">Live rankings updated after every match</p>
      </div>

      <div className="podium">
        {entries.slice(0, 3).map((entry, idx) => {
          const podiumClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : 'bronze';
          const medalColor = idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32';
          const avatarColor = getAvatarColor(entry.name);
          return (
            <div key={entry.participant_id} className={`podium-card ${podiumClass} ${entry.participant_id === currentParticipantId ? 'podium-you' : ''}`} style={{ order: idx === 0 ? 1 : idx === 1 ? 0 : 2 }}>
              <span className="podium-medal"><Trophy size={22} color={medalColor} /></span>
              <div className="podium-avatar" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)` }}>
                {entry.photo_url ? <img src={entry.photo_url} alt={entry.name} /> : <span>{entry.name.charAt(0)}</span>}
              </div>
              <span className="podium-name">{entry.display_name || entry.name}</span>
              <span className="podium-balance"><Coins size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />{formatCoins(entry.balance)}</span>
              {entry.delta !== undefined && entry.delta !== 0 && (
                <span className={`podium-delta ${entry.delta > 0 ? 'delta-up' : 'delta-down'}`}>
                  {entry.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(entry.delta)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="leaderboard-list">
        {entries.map((entry) => {
          const avatarColor = getAvatarColor(entry.name);
          const isYou = entry.participant_id === currentParticipantId;
          return (
            <div key={entry.participant_id} className={`leaderboard-row ${isYou ? 'leaderboard-you' : ''}`}>
              <span className="lb-rank">{entry.rank}</span>
              <div className="lb-avatar" style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)` }}>
                {entry.photo_url ? <img src={entry.photo_url} alt={entry.name} /> : <span>{entry.name.charAt(0)}</span>}
              </div>
              <span className="lb-name">
                <span className="lb-name-main">{entry.display_name || entry.name}</span>
                <span className="lb-name-sub">Rank movement: {entry.delta ?? 0}</span>
                {isYou && <span className="lb-you-tag">YOU</span>}
              </span>
              <span className="lb-balance"><Coins size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />{formatCoins(entry.balance)}</span>
              {entry.delta !== undefined && entry.delta !== 0 && (
                <span className={`lb-delta ${entry.delta > 0 ? 'delta-up' : 'delta-down'}`}>
                  {entry.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(entry.delta)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

