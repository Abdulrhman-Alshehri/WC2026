import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
  };
}

// Public web-app URL used for inline action buttons. Defaults to the live
// Netlify site; override with `supabase secrets set APP_BASE_URL=...` if it moves.
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") || "https://worldcup2026elcasino.netlify.app").replace(/\/+$/, "");

// WC2026 team flag lookup — football-data.org TLA codes → flag emoji
const FLAG_MAP: Record<string, string> = {
  // Americas
  MEX: '🇲🇽', USA: '🇺🇸', CAN: '🇨🇦', BRA: '🇧🇷', ARG: '🇦🇷',
  URU: '🇺🇾', COL: '🇨🇴', ECU: '🇪🇨', VEN: '🇻🇪', BOL: '🇧🇴',
  PAR: '🇵🇾', CHI: '🇨🇱', PER: '🇵🇪', CRC: '🇨🇷', PAN: '🇵🇦',
  HON: '🇭🇳', JAM: '🇯🇲', SLV: '🇸🇻', GUA: '🇬🇹', TRI: '🇹🇹',
  // Europe
  FRA: '🇫🇷', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ESP: '🇪🇸', GER: '🇩🇪', POR: '🇵🇹',
  NED: '🇳🇱', BEL: '🇧🇪', ITA: '🇮🇹', SUI: '🇨🇭', CRO: '🇭🇷',
  SRB: '🇷🇸', DEN: '🇩🇰', AUT: '🇦🇹', POL: '🇵🇱', TUR: '🇹🇷',
  ROU: '🇷🇴', SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', GEO: '🇬🇪', ALB: '🇦🇱', SVK: '🇸🇰',
  SVN: '🇸🇮', UKR: '🇺🇦', HUN: '🇭🇺', WAL: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', NOR: '🇳🇴',
  CZE: '🇨🇿', GRE: '🇬🇷', FIN: '🇫🇮', ISL: '🇮🇸',
  // Africa
  MAR: '🇲🇦', SEN: '🇸🇳', NGA: '🇳🇬', CMR: '🇨🇲', EGY: '🇪🇬',
  GHA: '🇬🇭', ALG: '🇩🇿', TUN: '🇹🇳', RSA: '🇿🇦', CIV: '🇨🇮',
  MLI: '🇲🇱', ZAM: '🇿🇲', ANG: '🇦🇴', COD: '🇨🇩',
  // Asia / Oceania
  JPN: '🇯🇵', KOR: '🇰🇷', AUS: '🇦🇺', IRN: '🇮🇷', SAU: '🇸🇦',
  KSA: '🇸🇦', QAT: '🇶🇦', CHN: '🇨🇳', IRQ: '🇮🇶', UZB: '🇺🇿',
  JOR: '🇯🇴', UAE: '🇦🇪', NZL: '🇳🇿', OMA: '🇴🇲', BHR: '🇧🇭',
  KWT: '🇰🇼', ISR: '🇮🇱',
};

function getFlag(code: string | null | undefined): string {
  if (!code) return '';
  return FLAG_MAP[code.toUpperCase()] ?? '';
}

// Converts HOME_WIN / AWAY_WIN / DRAW to a readable label with flag + team name.
// Also handles knockout-stage values HOME_ADVANCE / AWAY_ADVANCE.
function labelPrediction(
  prediction: string,
  homeTeam: string,
  awayTeam: string,
  homeCode?: string | null,
  awayCode?: string | null
): string {
  const hFlag = getFlag(homeCode);
  const aFlag = getFlag(awayCode);
  if (prediction === 'HOME_WIN' || prediction === 'HOME_ADVANCE')
    return `${hFlag} ${homeTeam}`.trim();
  if (prediction === 'AWAY_WIN' || prediction === 'AWAY_ADVANCE')
    return `${aFlag} ${awayTeam}`.trim();
  if (prediction === 'DRAW')
    return '🤝 Draw';
  return prediction; // fallback for any unknown value
}

// "Group B" style context line from stage / group_name.
function stageLabel(stage?: string | null, groupName?: string | null): string {
  const parts = [stage, groupName].filter(Boolean) as string[];
  return parts.join(' · ');
}

// Format an ISO timestamp in Arabia Standard Time (UTC+3, no DST).
function formatAst(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const f = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Riyadh',
  });
  return `${f.format(d)} AST`;
}

// "in 1h 58m" relative-time helper.
function relTime(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms) || ms <= 0) return 'now';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `in ${h}h ${m}m`;
  if (h > 0) return `in ${h}h`;
  return `in ${m}m`;
}

// Build a Telegram inline keyboard. Returns undefined when no APP_BASE_URL is
// configured (so messages still send, just without buttons).
function buildKeyboard(
  buttons: Array<{ text: string; path?: string }>
): unknown | undefined {
  if (!APP_BASE_URL) return undefined;
  const row = buttons.map((b) => ({
    text: b.text,
    url: b.path ? `${APP_BASE_URL}${b.path}` : APP_BASE_URL,
  }));
  return { inline_keyboard: [row] };
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
  botToken: string,
  replyMarkup?: unknown
): Promise<{ success: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Telegram API error: ${res.status} ${errText}`);
      return { success: false, error: `Telegram API error: ${res.status} - ${errText}` };
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
    return { success: false, error: err.message || String(err) };
  }
}

// Escape Telegram MarkdownV1 special characters inside dynamic strings.
function escMd(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/([_*`\[])/g, '\\$1');
}

function formatCoins(amount: number | string): string {
  if (typeof amount === 'string') {
    if (amount.includes(',')) return amount;
    const cleanAmount = amount.replace(/[^0-9.]/g, '');
    const num = Number(cleanAmount);
    return isNaN(num) ? amount : new Intl.NumberFormat('en-US').format(num);
  }
  const num = Number(amount);
  return isNaN(num) ? String(amount) : new Intl.NumberFormat('en-US').format(num);
}

async function logNotification(
  supabase: any,
  type: string,
  matchId: string | null,
  payload: any,
  status: 'SENT' | 'FAILED',
  errorText: string | null = null,
  messageText: string | null = null,
  participantId: string | null = null
) {
  try {
    const { error } = await supabase
      .from('notifications_log')
      .insert({
        type: type,
        match_id: matchId,
        participant_id: participantId,
        payload: payload,
        sent_at: new Date().toISOString(),
        status: status,
        error: errorText,
        message_text: messageText,
      });
    if (error) console.error('Failed to write to notifications_log:', error);
  } catch (err) {
    console.error('Failed to write to notifications_log (exception):', err);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable.');
    if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing Supabase configuration environment variables.');

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();

    // 1. Handle DB / App triggered notification events
    if (body && body.event) {
      console.log(`Received notification event: ${body.event}`);
      const { event, chat_id, data } = body;
      const targetChatId = chat_id || data?.telegram_chat_id;
      const matchId = data?.match_id || null;
      const participantId = data?.participant_id || null;

      if (!targetChatId) {
        return new Response(JSON.stringify({ success: false, error: 'No Telegram Chat ID found for notification' }), {
          headers: corsHeaders, status: 200,
        });
      }

      let text = '';
      let notificationType = '';
      let replyMarkup: unknown | undefined = undefined;

      if (event === 'test') {
        notificationType = 'TELEGRAM_TEST';
        const balanceFormatted = formatCoins(data.balance);
        text = `🔔 *FWC 2026 Prediction Pool Notification Test*\n\n` +
          `Your Telegram pairing is active and working perfectly! 🎉\n\n` +
          `💰 *Current Balance:* \`${balanceFormatted} Coins\`\n\n` +
          `You will receive alerts here for goal scores and predictions resolution! ⚽🤖`;

      } else if (event === 'prediction_placed') {
        notificationType = 'TELEGRAM_PREDICTION_PLACED';
        const stakeFormatted = formatCoins(data.stake);
        const balanceFormatted = formatCoins(data.balance);
        const choiceLabel = labelPrediction(data.prediction, data.home_team, data.away_team, data.home_team_code, data.away_team_code);
        text = `🎯 *Prediction Placed!* ⚽\n\n` +
          `You successfully staked *${stakeFormatted} Coins* on the match:\n` +
          `🆚 *${escMd(data.home_team)} vs ${escMd(data.away_team)}*\n` +
          `📝 *Your Choice:* \`${choiceLabel}\`\n\n` +
          `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\`\n\n` +
          `Good luck! 🏆`;

      } else if (event === 'prediction_cancelled') {
        notificationType = 'TELEGRAM_PREDICTION_CANCELLED';
        const stakeFormatted = formatCoins(data.stake);
        const balanceFormatted = formatCoins(data.balance);
        text = `❌ *Prediction Cancelled!*\n\n` +
          `Your prediction on *${escMd(data.home_team)} vs ${escMd(data.away_team)}* has been cancelled.\n` +
          `💰 *Stake Refunded:* \`+${stakeFormatted} Coins\`\n\n` +
          `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;

      } else if (event === 'prediction_updated') {
        notificationType = 'TELEGRAM_PREDICTION_UPDATED';
        const balanceFormatted = formatCoins(data.balance);
        const outcomeChanged = data.old_prediction !== data.new_prediction;
        const stakeChanged = Number(data.old_stake) !== Number(data.new_stake);
        const oldLabel = labelPrediction(data.old_prediction, data.home_team, data.away_team, data.home_team_code, data.away_team_code);
        const newLabel = labelPrediction(data.new_prediction, data.home_team, data.away_team, data.home_team_code, data.away_team_code);

        let diffLines = '';
        if (outcomeChanged) diffLines += `📝 *Choice:* \`${oldLabel} → ${newLabel}\`\n`;
        if (stakeChanged)   diffLines += `💰 *Stake:* \`${formatCoins(data.old_stake)} → ${formatCoins(data.new_stake)} Coins\`\n`;
        // Guard against an empty diff (nothing actually changed)
        if (!diffLines) diffLines = `_No changes were applied._\n`;

        text = `✏️ *Prediction Updated!* ⚽\n\n` +
          `🆚 *${escMd(data.home_team)} vs ${escMd(data.away_team)}*\n\n` +
          diffLines + `\n` +
          `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;

      } else if (event === 'prediction_resolved') {
        notificationType = 'TELEGRAM_PREDICTION_RESOLVED';
        const isWin = data.status === 'WON';
        const stakeFormatted = formatCoins(data.stake);
        const balanceFormatted = formatCoins(data.balance);
        const choiceLabel = labelPrediction(data.prediction, data.home_team, data.away_team, data.home_team_code, data.away_team_code);
        replyMarkup = buildKeyboard([{ text: '🏆 Leaderboard' }, { text: '⚽ Next Matches' }]);

        if (isWin) {
          const payoutFormatted = formatCoins(data.payout);
          const profitFormatted = formatCoins(data.profit);
          text = `🎉 *Staking Win! Payout Processed!* 💰\n\n` +
            `Match *${escMd(data.home_team)} vs ${escMd(data.away_team)}* is resolved.\n` +
            `🏁 *Result:* \`${data.home_score} - ${data.away_score}\`\n\n` +
            `📈 *Prediction:* \`${choiceLabel}\` ✅ (WON)\n` +
            `💸 *Staked:* \`${stakeFormatted} Coins\`\n` +
            `🎁 *Net Payout:* \`+${payoutFormatted} Coins\` (Profit: +${profitFormatted} Coins) 🎉\n\n` +
            `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;
        } else {
          text = `💔 *Prediction Settled*\n\n` +
            `Match *${escMd(data.home_team)} vs ${escMd(data.away_team)}* is resolved.\n` +
            `🏁 *Result:* \`${data.home_score} - ${data.away_score}\`\n\n` +
            `📈 *Prediction:* \`${choiceLabel}\` ❌ (LOST)\n` +
            `💸 *Staked:* \`${stakeFormatted} Coins\` (Lost)\n\n` +
            `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;
        }

      } else if (event === 'deadline_reminder') {
        // Sent ~2h before prediction_close to paired users who have NOT predicted.
        notificationType = 'TELEGRAM_DEADLINE_REMINDER';
        const balanceFormatted = formatCoins(data.balance);
        const ctx = stageLabel(data.stage, data.group_name);
        const home = `${escMd(data.home_team)} ${getFlag(data.home_team_code)}`.trim();
        const away = `${getFlag(data.away_team_code)} ${escMd(data.away_team)}`.trim();
        replyMarkup = buildKeyboard([{ text: '🎯 Place Prediction' }, { text: '⚽ View All Matches' }]);

        text = `⏰ *Prediction Deadline: 2 Hours Left!*\n\n` +
          `🆚 *${home} vs ${away}*\n` +
          (ctx ? `🏆 ${escMd(ctx)}\n` : ``) +
          `🔒 *Locks:* ${formatAst(data.prediction_close)} (${relTime(data.prediction_close)})\n\n` +
          `You haven't placed a prediction yet!\n` +
          `💰 *Current Balance:* \`${balanceFormatted} Coins\``;

      } else if (event === 'rank_change') {
        // direction: 'UP' (gain) or 'DOWN' (drop). Fired after settlement when
        // a participant moves >= 2 ranks vs the previous leaderboard snapshot.
        notificationType = 'TELEGRAM_RANK_CHANGE';
        const balanceFormatted = formatCoins(data.balance);
        const oldRank = Number(data.old_rank);
        const newRank = Number(data.new_rank);
        const moved = Math.abs(oldRank - newRank);
        const isUp = data.direction === 'UP';

        // Render the recent result lines (this match's outcome for the user).
        let resultLines = '';
        const results: any[] = Array.isArray(data.results) ? data.results : [];
        for (const r of results) {
          const icon = r.status === 'WON' ? '✅' : '❌';
          const amount = r.status === 'WON'
            ? `+${formatCoins(r.payout)}`
            : `${formatCoins(r.stake)}`;
          const verb = r.status === 'WON' ? 'Won' : 'Lost';
          resultLines += `• ${escMd(r.home_team)} vs ${escMd(r.away_team)}: ${icon} ${verb} \`${amount} Coins\`\n`;
        }

        replyMarkup = buildKeyboard([{ text: '🏆 Leaderboard' }, { text: '⚽ Next Matches' }]);

        if (isUp) {
          text = `📈 *Rank Gain!* 🎉\n\n` +
            `✨ You moved from *#${oldRank} → #${newRank}* (▲${moved})\n\n` +
            (resultLines ? `Recent results:\n${resultLines}\n` : ``) +
            `Current Rank: *#${newRank}*\n` +
            `💎 *Balance:* \`${balanceFormatted} Coins\``;
        } else {
          text = `📉 *Rank Drop Alert!*\n\n` +
            `⚠️ You moved from *#${oldRank} → #${newRank}* (▼${moved})\n\n` +
            (resultLines ? `Recent results:\n${resultLines}\n` : ``) +
            `Current Rank: *#${newRank}*\n` +
            `💎 *Balance:* \`${balanceFormatted} Coins\``;
        }

      } else if (event === 'leaderboard_broadcast') {
        // Posts the full standings to a paired user after each match resolves.
        // The trigger only sends chat_id + participant_id + match context; this
        // function renders the table itself from leaderboard_view.
        notificationType = 'TELEGRAM_LEADERBOARD';
        replyMarkup = buildKeyboard([{ text: '🏆 Open Leaderboard' }]);

        const { data: rows } = await supabase
          .from('leaderboard_view')
          .select('participant_id, name, display_name, blinded_balance, rank')
          .order('rank', { ascending: true });

        const all: any[] = rows || [];
        const top = all.slice(0, 10);
        const me = all.find((r) => r.participant_id === participantId);

        const medal = (rank: number) =>
          rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `*${rank}.*`;

        let table = '';
        for (const r of top) {
          const nm = escMd(r.display_name || r.name);
          const youMark = r.participant_id === participantId ? ' 👈 *You*' : '';
          table += `${medal(r.rank)} ${nm} — \`${formatCoins(r.blinded_balance)}\`${youMark}\n`;
        }

        let header = `🏆 *FWC 2026 Leaderboard*`;
        if (data?.home_team && data?.away_team) {
          header += `\n_Updated after ${escMd(data.home_team)} ${data.home_score ?? ''}–${data.away_score ?? ''} ${escMd(data.away_team)}_`;
        }

        let youLine = '';
        if (me && me.rank > 10) {
          youLine = `\n…\n👈 *You:* #${me.rank} — \`${formatCoins(me.blinded_balance)}\``;
        }

        text = `${header}\n\n${table}${youLine}`;

      }

      if (text) {
        const sendResult = await sendTelegramMessage(Number(targetChatId), text, botToken, replyMarkup);
        const status = sendResult.success ? 'SENT' : 'FAILED';
        const errorText = sendResult.error || null;
        await logNotification(supabase, notificationType, matchId, body, status, errorText, text, participantId);
      }

      return new Response(JSON.stringify({ success: true, message: 'Notification processed successfully' }), {
        headers: corsHeaders, status: 200,
      });
    }

    // 2. Handle Incoming Updates from Telegram Webhook Bot API
    const update: TelegramUpdate = body;
    if (!update.message || !update.message.text) {
      return new Response(JSON.stringify({ success: true, message: 'No text message to handle' }), {
        headers: corsHeaders, status: 200,
      });
    }

    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    const telegramUsername = update.message.from.username || null;
    const firstName = update.message.from.first_name || 'there';

    console.log(`Received bot command: "${text}" from Chat ID: ${chatId}, Username: ${telegramUsername}`);

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const participantId = parts[1];

      if (participantId && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(participantId)) {
        console.log(`Starting link pairing for Participant ID: ${participantId}`);

        const { data: participant, error: fetchErr } = await supabase
          .from('participants')
          .select('id, name, display_name')
          .eq('id', participantId)
          .single();

        if (fetchErr || !participant) {
          console.error(`Failed to find participant ${participantId}:`, fetchErr);
          await sendTelegramMessage(
            chatId,
            `⚠️ *Link Failed*: Could not find a matching prediction pool account. Please refresh your Profile Settings page on the website and click the link button again!`,
            botToken
          );
          return new Response(JSON.stringify({ success: false, error: 'Participant not found' }), {
            headers: corsHeaders, status: 200,
          });
        }

        const cleanUsername = telegramUsername ? telegramUsername.replace(/^@/, '') : null;
        const { error: updateErr } = await supabase
          .from('participants')
          .update({ telegram_chat_id: String(chatId), telegram_user: cleanUsername })
          .eq('id', participantId);

        if (updateErr) {
          console.error(`Failed to link participant ${participantId}:`, updateErr);
          await sendTelegramMessage(
            chatId,
            `⚠️ *Database Error*: We encountered an error linking your account. Please try again in a few moments.`,
            botToken
          );
          return new Response(JSON.stringify({ success: false, error: 'Database update error' }), {
            headers: corsHeaders, status: 200,
          });
        }

        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('participant_id', participantId)
          .single();

        const formattedBalance = wallet ? formatCoins(wallet.balance) : '1,000,000';
        const displayName = participant.display_name || participant.name;

        const welcomeText = `⚽ *Welcome to FWC 2026 Predictions, ${escMd(displayName)}!* 🏆\n\n` +
          `Your Telegram account is now *successfully linked* to your prediction wallet! 🤝\n\n` +
          `You will receive real-time updates directly in this chat:\n` +
          `⏰ *Deadline reminders* (2 hours before lockout)\n` +
          `🎯 *Prediction confirmations* (placed, updated, cancelled)\n` +
          `💰 *Staking results* & payout summaries\n` +
          `📊 *Rank changes* & live leaderboard updates\n\n` +
          `💎 *Current Balance:* \`${formattedBalance} Coins\`\n\n` +
          `Good luck with your predictions! ⚽🔥`;

        const sendResult = await sendTelegramMessage(chatId, welcomeText, botToken, buildKeyboard([{ text: '⚽ Open App' }]));
        const status = sendResult.success ? 'SENT' : 'FAILED';
        const errorText = sendResult.error || null;
        await logNotification(supabase, 'TELEGRAM_WELCOME', null, { participant_id: participantId, username: cleanUsername, chat_id: chatId }, status, errorText, welcomeText, participantId);
        console.log(`Successfully paired Chat ID ${chatId} with Participant: ${displayName}`);

      } else {
        const introText = `👋 Hello ${firstName}!\n\n` +
          `To enable real-time predictions alerts:\n` +
          `1. Open the *FWC 2026 Predictions* website.\n` +
          `2. Go to your *Profile Settings*.\n` +
          `3. Click the *Pair Telegram Bot* button under Notifications.\n\n` +
          `This will pair your account securely! ⚽🤖`;
        await sendTelegramMessage(chatId, introText, botToken);
      }
    } else {
      const helpText = `🤖 *FWC 2026 Predictions Bot*\n\n` +
        `This bot delivers real-time notifications for the tournament pool.\n` +
        `Commands:\n` +
        `/start - Trigger account pairing instructions`;
      await sendTelegramMessage(chatId, helpText, botToken);
    }

    return new Response(JSON.stringify({ success: true, message: 'Webhook processed successfully' }), {
      headers: corsHeaders, status: 200,
    });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Unknown error occurred' }), {
      headers: corsHeaders, status: 500,
    });
  }
});
