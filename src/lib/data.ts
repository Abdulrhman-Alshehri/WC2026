import { Match, Participant, LeaderboardEntry } from '../types';

// Demo participants for the identity selector (fallback when Supabase is unavailable)
export const DEMO_PARTICIPANTS: Participant[] = [
  { id: '1', name: 'Abdulrhman', display_name: 'Abdulrhman', photo_url: '/avatars/Abdulrhman.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '2', name: 'Aseel', display_name: 'Aseel', photo_url: '/avatars/Aseel.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '3', name: 'Bijad', display_name: 'Bijad', photo_url: '/avatars/Bijad.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '4', name: 'Haddad', display_name: 'Haddad', photo_url: '/avatars/Haddad.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '5', name: 'Hussam', display_name: 'Hussam', photo_url: '/avatars/Hussam.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '6', name: 'Ibrahim', display_name: 'Ibrahim', photo_url: '/avatars/Ibrahim.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '7', name: 'Khatrawi', display_name: 'Khatrawi', photo_url: '/avatars/Khatrawi.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '8', name: 'Obaid', display_name: 'Obaid', photo_url: '/avatars/Obaid.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '9', name: 'Saleh', display_name: 'Saleh', photo_url: '/avatars/Saleh.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '10', name: 'Turkis', display_name: 'Turkis', photo_url: '/avatars/Turkis.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
  { id: '11', name: 'Yousef', display_name: 'Yousef', photo_url: '/avatars/Yousef.png', telegram_user: null, pin: null, is_active: true, created_at: '' },
];

// Demo matches for the dashboard
export const DEMO_MATCHES: Match[] = [
  {
    id: 'm1', api_match_id: '1001', home_team: 'Mexico', away_team: 'Canada',
    home_team_code: 'MEX', away_team_code: 'CAN', home_logo_url: null, away_logo_url: null,
    kickoff_utc: '2026-06-11T22:00:00Z', stage: 'GROUP', group_name: 'A',
    status: 'NS', home_score: null, away_score: null, result: null, resolved: false,
    prediction_close: '2026-06-11T21:00:00Z', created_at: '', updated_at: '',
  },
  {
    id: 'm2', api_match_id: '1002', home_team: 'United States', away_team: 'Colombia',
    home_team_code: 'USA', away_team_code: 'COL', home_logo_url: null, away_logo_url: null,
    kickoff_utc: '2026-06-12T01:00:00Z', stage: 'GROUP', group_name: 'A',
    status: 'NS', home_score: null, away_score: null, result: null, resolved: false,
    prediction_close: '2026-06-12T00:00:00Z', created_at: '', updated_at: '',
  },
  {
    id: 'm3', api_match_id: '1003', home_team: 'Argentina', away_team: 'Saudi Arabia',
    home_team_code: 'ARG', away_team_code: 'KSA', home_logo_url: null, away_logo_url: null,
    kickoff_utc: '2026-06-12T19:00:00Z', stage: 'GROUP', group_name: 'B',
    status: 'NS', home_score: null, away_score: null, result: null, resolved: false,
    prediction_close: '2026-06-12T18:00:00Z', created_at: '', updated_at: '',
  },
  {
    id: 'm4', api_match_id: '1004', home_team: 'France', away_team: 'Germany',
    home_team_code: 'FRA', away_team_code: 'GER', home_logo_url: null, away_logo_url: null,
    kickoff_utc: '2026-06-13T16:00:00Z', stage: 'GROUP', group_name: 'C',
    status: 'LIVE', home_score: 2, away_score: 1, result: null, resolved: false,
    prediction_close: '2026-06-13T15:00:00Z', created_at: '', updated_at: '',
  },
  {
    id: 'm5', api_match_id: '1005', home_team: 'Brazil', away_team: 'Japan',
    home_team_code: 'BRA', away_team_code: 'JPN', home_logo_url: null, away_logo_url: null,
    kickoff_utc: '2026-06-13T22:00:00Z', stage: 'GROUP', group_name: 'D',
    status: 'FT', home_score: 3, away_score: 0, result: 'HOME_WIN', resolved: true,
    prediction_close: '2026-06-13T21:00:00Z', created_at: '', updated_at: '',
  },
  {
    id: 'm6', api_match_id: '1006', home_team: 'Spain', away_team: 'England',
    home_team_code: 'ESP', away_team_code: 'ENG', home_logo_url: null, away_logo_url: null,
    kickoff_utc: '2026-06-14T19:00:00Z', stage: 'GROUP', group_name: 'E',
    status: 'NS', home_score: null, away_score: null, result: null, resolved: false,
    prediction_close: '2026-06-14T18:00:00Z', created_at: '', updated_at: '',
  },
];

export const DEMO_LEADERBOARD: LeaderboardEntry[] = [
  { participant_id: '1', name: 'Abdulrhman', display_name: 'Abdulrhman', photo_url: '/avatars/Abdulrhman.png', balance: 1250000, rank: 1, delta: 2 },
  { participant_id: '2', name: 'Aseel', display_name: 'Aseel', photo_url: '/avatars/Aseel.png', balance: 1180000, rank: 2, delta: 1 },
  { participant_id: '3', name: 'Bijad', display_name: 'Bijad', photo_url: '/avatars/Bijad.png', balance: 1120000, rank: 3, delta: -1 },
  { participant_id: '4', name: 'Haddad', display_name: 'Haddad', photo_url: '/avatars/Haddad.png', balance: 1050000, rank: 4, delta: 0 },
  { participant_id: '5', name: 'Hussam', display_name: 'Hussam', photo_url: '/avatars/Hussam.png', balance: 1010000, rank: 5, delta: 3 },
  { participant_id: '6', name: 'Ibrahim', display_name: 'Ibrahim', photo_url: '/avatars/Ibrahim.png', balance: 980000, rank: 6, delta: -2 },
  { participant_id: '7', name: 'Khatrawi', display_name: 'Khatrawi', photo_url: '/avatars/Khatrawi.png', balance: 950000, rank: 7, delta: 0 },
  { participant_id: '8', name: 'Obaid', display_name: 'Obaid', photo_url: '/avatars/Obaid.png', balance: 920000, rank: 8, delta: -1 },
  { participant_id: '9', name: 'Saleh', display_name: 'Saleh', photo_url: '/avatars/Saleh.png', balance: 880000, rank: 9, delta: 1 },
  { participant_id: '10', name: 'Turkis', display_name: 'Turkis', photo_url: '/avatars/Turkis.png', balance: 850000, rank: 10, delta: -3 },
  { participant_id: '11', name: 'Yousef', display_name: 'Yousef', photo_url: '/avatars/Yousef.png', balance: 810000, rank: 11, delta: 0 },
];

// Country code to flag emoji mapping
export function getFlagEmoji(countryCode: string | null): string {
  if (!countryCode) return '🏳️';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 0x1F1E6 + char.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

export function formatCoins(amount: number): string {
  return new Intl.NumberFormat('en-US').format(amount);
}

export function getTimeUntil(dateStr: string): { days: number; hours: number; minutes: number; seconds: number } {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function getMatchStatusLabel(status: string): string {
  switch (status) {
    case 'NS': return 'Upcoming';
    case 'LIVE': return 'LIVE';
    case 'HT': return 'Half Time';
    case 'FT': return 'Full Time';
    case 'AET': return 'After Extra Time';
    case 'PEN': return 'Penalties';
    case 'CANC': return 'Cancelled';
    case 'PST': return 'Postponed';
    default: return status;
  }
}

export function isPredictionWindowOpen(match: Match): boolean {
  return new Date(match.prediction_close).getTime() > Date.now() && match.status === 'NS';
}

export function isKnockoutStage(stage: string): boolean {
  return ['R32', 'R16', 'QF', 'SF', 'FINAL'].includes(stage);
}

// Generate avatar initials color from name
export function getAvatarColor(name: string): string {
  const colors = [
    '#6101eb', '#751313', '#014c3f', '#d70000',
    '#b486fe', '#01c752', '#3150ff', '#ff3c04',
    '#bb6ac7', '#2396f2', '#b1ea02', '#e71f63',
    '#63ffd9', '#ff9e81', '#ebff44', '#1a247c',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
