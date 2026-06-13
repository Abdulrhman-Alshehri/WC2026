import { LeaderboardEntry } from '../types';
import { getAvatarColor, formatCoins } from '../lib/data';
import { TrendingDown, TrendingUp, Trophy } from 'lucide-react';

interface Props {
  entries: LeaderboardEntry[];
  currentParticipantId: string;
}

export default function Leaderboard({ entries, currentParticipantId }: Props) {
  // ── Empty-state guard ──────────────────────────────────────────
  // Prevents a blank screen if no wallet data is available yet
  // (e.g. tournament hasn't started, Supabase returns empty).
  if (!entries || entries.length === 0) {
    return (
      <div className="leaderboard-page">
        <div className="leaderboard-header">
          <div className="leaderboard-kicker">Trophy Rankings</div>
          <h2>Leaderboard</h2>
          <p className="leaderboard-subtitle">Live rankings updated after every match</p>
        </div>
        <div className="state-card state-card-large">
          <Trophy size={40} color="var(--accent)" />
          <h3>Tournament Starting Soon</h3>
          <p>Rankings will appear once the first match is resolved.<br />All participants start with 1,000,000 coins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-page">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="leaderboard-header">
        <div className="leaderboard-kicker">Trophy Rankings</div>
        <h2>Leaderboard</h2>
        <p className="leaderboard-subtitle">Live rankings updated after every match</p>
      </div>

      {/* ── Podium — Top 3 ──────────────────────────────────────── */}
      {/* CSS ordering: gold=order:1 (center), silver=order:0 (left), bronze=order:2 (right) */}
      {/* Mobile: gold goes order:0, full-width row; silver/bronze flex:1 side-by-side */}
      <div className="podium">
        {entries.slice(0, 3).map((entry, idx) => {
          const podiumClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : 'bronze';
          const medalColor = idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : '#CD7F32';
          const avatarColor = getAvatarColor(entry.name);
          return (
            <div
              key={entry.participant_id}
              className={`podium-card ${podiumClass} ${entry.participant_id === currentParticipantId ? 'podium-you' : ''}`}
            >
              <span className="podium-medal">
                <Trophy size={22} color={medalColor} />
              </span>

              {/* Avatar: letter sits at z-1, image overlays at z-2.
                  This prevents the letter from bleeding through the image on iOS/Safari. */}
              <div
                className="podium-avatar"
                style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)` }}
              >
                <span className="podium-avatar-letter">{entry.name.charAt(0)}</span>
                {entry.photo_url && (
                  <img
                    src={entry.photo_url}
                    alt={entry.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
              </div>

              <span className="podium-name">{entry.display_name || entry.name}</span>

              {/* Blinded balance — only shifts when matches resolve, never on stake placement */}
              <span className="podium-balance">{formatCoins(entry.blinded_balance)}</span>

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

      {/* ── Full Standings List ──────────────────────────────────── */}
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

              {/* List avatar: conditional render (image or letter fallback) */}
              <div
                className="lb-avatar"
                style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)` }}
              >
                {entry.photo_url ? (
                  <img
                    src={entry.photo_url}
                    alt={entry.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span>{entry.name.charAt(0)}</span>
                )}
              </div>

              <span className="lb-name">
                <span className="lb-name-main">{entry.display_name || entry.name}</span>
                {isYou && <span className="lb-you-tag">YOU</span>}
              </span>

              {entry.delta !== undefined && entry.delta !== 0 && (
                <span className={`lb-delta ${entry.delta > 0 ? 'delta-up' : 'delta-down'}`}>
                  {entry.delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {Math.abs(entry.delta)}
                </span>
              )}

              {/* Blinded balance — privacy-safe (balance + in_play) */}
              <span className="lb-balance">{formatCoins(entry.blinded_balance)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
