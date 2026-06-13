export interface Participant {
  id: string;
  name: string;
  display_name: string | null;
  photo_url: string | null;
  telegram_user: string | null;
  telegram_chat_id?: string | null;
  pin: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Wallet {
  id: string;
  participant_id: string;
  balance: number;
  in_play: number;
  updated_at: string;
}

export interface Match {
  id: string;
  api_match_id: string;
  home_team: string;
  away_team: string;
  home_team_code: string | null;
  away_team_code: string | null;
  home_logo_url: string | null;
  away_logo_url: string | null;
  kickoff_utc: string;
  stage: string;
  group_name: string | null;
  status: 'NS' | 'LIVE' | 'HT' | 'FT' | 'AET' | 'PEN' | 'CANC' | 'PST';
  home_score: number | null;
  away_score: number | null;
  result: string | null;
  resolved: boolean;
  prediction_close: string;
  created_at: string;
  updated_at: string;
}

export interface Prediction {
  id: string;
  participant_id: string;
  match_id: string;
  prediction: 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' | 'HOME_ADVANCE' | 'AWAY_ADVANCE';
  stake: number;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: number | null;
  submitted_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  participant_id: string;
  match_id: string | null;
  prediction_id: string | null;
  type: 'STAKE' | 'PAYOUT' | 'REFUND' | 'INITIAL_BALANCE';
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
}

export interface LeaderboardEntry {
  participant_id: string;
  name: string;
  display_name: string | null;
  photo_url: string | null;
  blinded_balance: number;
  rank: number;
  delta?: number;
}

export interface ChatParticipantInfo {
  name: string;
  display_name: string | null;
  photo_url: string | null;
}

export interface ChatReactionAggregate {
  emoji: string;
  count: number;
  meReacted: boolean;
  participantIds: string[];
}

export interface ChatMessage {
  id: string;
  participant_id: string;
  message: string;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  participants?: ChatParticipantInfo;
  reactions: ChatReactionAggregate[];
}

