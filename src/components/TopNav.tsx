import { Participant } from '../types';
import { formatCoins } from '../lib/data';
import { Coins, Activity, Trophy, History, Sun, Moon } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

interface Props {
  participant: Participant;
  balance: number;
  inPlay: number;
  onNavigate: (page: string) => void;
  currentPage: string;
  onOpenProfile: () => void;
}

export default function TopNav({ participant, balance, inPlay, onNavigate, currentPage, onOpenProfile }: Props) {
  const [isDark, toggleTheme] = useDarkMode();

  return (
    <>
    <header className="topnav">
      <div className="topnav-left">
        <button className="topnav-logo-btn" onClick={() => onNavigate('dashboard')}>
          <img src="/logo.jpg" alt="WC2026" className="topnav-logo" />
          <span className="topnav-brand">WC 2026</span>
        </button>
      </div>

      <nav className="topnav-center">
        <button className={`topnav-link ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => onNavigate('dashboard')}>Matches</button>
        <button className={`topnav-link ${currentPage === 'leaderboard' ? 'active' : ''}`} onClick={() => onNavigate('leaderboard')}>Leaderboard</button>
        <button className={`topnav-link ${currentPage === 'history' ? 'active' : ''}`} onClick={() => onNavigate('history')}>History</button>
      </nav>

      <div className="topnav-right">
        <div className="balance-chip">
          <Coins size={16} className="balance-icon" />
          <div className="balance-chip-text">
            <span className="balance-amount">{formatCoins(balance)}</span>
            {inPlay > 0 && <span className="in-play-label">{formatCoins(inPlay)} in play</span>}
          </div>
        </div>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="topnav-user" onClick={onOpenProfile} title="Profile settings">
          <span className="topnav-user-name">{participant.display_name || participant.name}</span>
          <span className="topnav-user-avatar">
            {participant.photo_url ? <img src={participant.photo_url} alt={participant.name} /> : participant.name.charAt(0).toUpperCase()}
          </span>
        </button>
      </div>
    </header>
    <nav className="bottom-tab-bar" aria-label="Main navigation">
      <button className={`bottom-tab ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => onNavigate('dashboard')}>
        <Activity size={22} />
        <span>Matches</span>
      </button>
      <button className={`bottom-tab ${currentPage === 'leaderboard' ? 'active' : ''}`} onClick={() => onNavigate('leaderboard')}>
        <Trophy size={22} />
        <span>Leaderboard</span>
      </button>
      <button className={`bottom-tab ${currentPage === 'history' ? 'active' : ''}`} onClick={() => onNavigate('history')}>
        <History size={22} />
        <span>History</span>
      </button>
    </nav>
    </>
  );
}
