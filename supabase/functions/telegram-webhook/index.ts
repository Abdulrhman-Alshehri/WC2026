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

async function sendTelegramMessage(
  chatId: number,
  text: string,
  botToken: string
): Promise<{ success: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
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

// Helper to format coin balances with commas (e.g. 1,250,000)
function formatCoins(amount: number | string): string {
  if (typeof amount === 'string') {
    // If it's already a formatted string containing commas, return it as-is
    if (amount.includes(',')) {
      return amount;
    }
    // Clean up any non-numeric characters except decimal points
    const cleanAmount = amount.replace(/[^0-9.]/g, '');
    const num = Number(cleanAmount);
    return isNaN(num) ? amount : new Intl.NumberFormat('en-US').format(num);
  }
  const num = Number(amount);
  return isNaN(num) ? String(amount) : new Intl.NumberFormat('en-US').format(num);
}

// Helper to log notifications to the public.notifications_log table
async function logNotification(
  supabase: any,
  type: string,
  matchId: string | null,
  payload: any,
  status: 'SENT' | 'FAILED',
  errorText: string | null = null
) {
  try {
    const { error } = await supabase
      .from('notifications_log')
      .insert({
        type: type,
        match_id: matchId,
        payload: payload,
        sent_at: new Date().toISOString(),
        status: status,
        error: errorText,
      });
    if (error) {
      console.error('Failed to write to notifications_log:', error);
    }
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

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable.");
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase configuration environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();

    // 1. Handle DB Staking or Test Notifications Triggered from Postgres / App
    if (body && body.event) {
      console.log(`Received database/system notification event: ${body.event}`);
      const { event, chat_id, data } = body;
      const targetChatId = chat_id || data?.telegram_chat_id;
      const matchId = data?.match_id || null;

      if (!targetChatId) {
        return new Response(JSON.stringify({ success: false, error: "No Telegram Chat ID found for notification" }), {
          headers: corsHeaders,
          status: 200,
        });
      }

      let text = "";
      let notificationType = "";

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
        text = `🎯 *Prediction Placed!* ⚽\n\n` +
          `You successfully staked *${stakeFormatted} Coins* on the match:\n` +
          `🆚 *${data.home_team} vs ${data.away_team}*\n` +
          `📝 *Your Choice:* \`${data.prediction}\`\n\n` +
          `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\`\n\n` +
          `Good luck! 🏆`;
      } else if (event === 'prediction_cancelled') {
        notificationType = 'TELEGRAM_PREDICTION_CANCELLED';
        const stakeFormatted = formatCoins(data.stake);
        const balanceFormatted = formatCoins(data.balance);
        text = `❌ *Prediction Cancelled!*\n\n` +
          `Your prediction on *${data.home_team} vs ${data.away_team}* has been cancelled.\n` +
          `💰 *Stake Refunded:* \`+${stakeFormatted} Coins\`\n\n` +
          `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;
      } else if (event === 'prediction_updated') {
        notificationType = 'TELEGRAM_PREDICTION_UPDATED';
        const balanceFormatted = formatCoins(data.balance);
        const outcomeChanged = data.old_prediction !== data.new_prediction;
        const stakeChanged = Number(data.old_stake) !== Number(data.new_stake);

        let diffLines = '';
        if (outcomeChanged) {
          diffLines += `📝 *Choice:* \`${data.old_prediction} → ${data.new_prediction}\`\n`;
        }
        if (stakeChanged) {
          diffLines += `💰 *Stake:* \`${formatCoins(data.old_stake)} → ${formatCoins(data.new_stake)} Coins\`\n`;
        }

        text = `✏️ *Prediction Updated!* ⚽\n\n` +
          `🆚 *${data.home_team} vs ${data.away_team}*\n\n` +
          diffLines + `\n` +
          `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;
      } else if (event === 'prediction_resolved') {
        notificationType = 'TELEGRAM_PREDICTION_RESOLVED';
        const isWin = data.status === 'WON';
        const stakeFormatted = formatCoins(data.stake);
        const balanceFormatted = formatCoins(data.balance);

        if (isWin) {
          const payoutFormatted = formatCoins(data.payout);
          const profitFormatted = formatCoins(data.profit);
          text = `🎉 *Staking Win! Payout Processed!* 💰\n\n` +
            `Match *${data.home_team} vs ${data.away_team}* is resolved.\n` +
            `🏁 *Result:* \`${data.home_score} - ${data.away_score}\`\n\n` +
            `📈 *Prediction:* \`${data.prediction}\` (WON)\n` +
            `💸 *Staked:* \`${stakeFormatted} Coins\`\n` +
            `🎁 *Net Payout:* \`+${payoutFormatted} Coins\` (Profit: +${profitFormatted} Coins) 🎉\n\n` +
            `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;
        } else {
          text = `💔 *Prediction Settled*\n\n` +
            `Match *${data.home_team} vs ${data.away_team}* is resolved.\n` +
            `🏁 *Result:* \`${data.home_score} - ${data.away_score}\`\n\n` +
            `📈 *Prediction:* \`${data.prediction}\` (LOST)\n` +
            `💸 *Staked:* \`${stakeFormatted} Coins\` (Lost)\n\n` +
            `💎 *New Liquid Balance:* \`${balanceFormatted} Coins\``;
        }
      }

      if (text) {
        const sendResult = await sendTelegramMessage(Number(targetChatId), text, botToken);
        const status = sendResult.success ? 'SENT' : 'FAILED';
        const errorText = sendResult.error || null;
        
        await logNotification(supabase, notificationType, matchId, body, status, errorText);
      }

      return new Response(JSON.stringify({ success: true, message: "Notification processed successfully" }), {
        headers: corsHeaders,
        status: 200,
      });
    }

    // 2. Handle Incoming Updates from Telegram Webhook Bot API
    const update: TelegramUpdate = body;
    if (!update.message || !update.message.text) {
      return new Response(JSON.stringify({ success: true, message: "No text message to handle" }), {
        headers: corsHeaders,
        status: 200,
      });
    }

    const text = update.message.text.trim();
    const chatId = update.message.chat.id;
    const telegramUsername = update.message.from.username || null;
    const firstName = update.message.from.first_name || "there";

    console.log(`Received bot command: "${text}" from Chat ID: ${chatId}, Username: ${telegramUsername}`);

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const participantId = parts[1]; // Extract the UUID parameter

      if (participantId && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(participantId)) {
        console.log(`Starting link pairing verification for Participant ID: ${participantId}`);

        // Fetch participant profile
        const { data: participant, error: fetchErr } = await supabase
          .from('participants')
          .select('id, name, display_name')
          .eq('id', participantId)
          .single();

        if (fetchErr || !participant) {
          console.error(`Failed to find participant matching ID ${participantId}:`, fetchErr);
          await sendTelegramMessage(
            chatId,
            `⚠️ *Link Failed*: Could not find a matching prediction pool account. Please refresh your Profile Settings page on the website and click the link button again!`,
            botToken
          );
          return new Response(JSON.stringify({ success: false, error: "Participant not found" }), {
            headers: corsHeaders,
            status: 200,
          });
        }

        // Pair Telegram Chat ID and username
        const cleanUsername = telegramUsername ? telegramUsername.replace(/^@/, '') : null;
        const { error: updateErr } = await supabase
          .from('participants')
          .update({
            telegram_chat_id: String(chatId),
            telegram_user: cleanUsername,
          })
          .eq('id', participantId);

        if (updateErr) {
          console.error(`Failed to link participant ${participantId}:`, updateErr);
          await sendTelegramMessage(
            chatId,
            `⚠️ *Database Error*: We encountered an error linking your account. Please try again in a few moments.`,
            botToken
          );
          return new Response(JSON.stringify({ success: false, error: "Database update error" }), {
            headers: corsHeaders,
            status: 200,
          });
        }

        // Retrieve wallet balance
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('participant_id', participantId)
          .single();

        const formattedBalance = wallet 
          ? formatCoins(wallet.balance)
          : '1,000,000';

        const displayName = participant.display_name || participant.name;

        // Send successful pairing confirmation welcome message
        const welcomeText = `⚽ *Welcome to FWC 2026 Predictions, ${displayName}!* 🏆\n\n` +
          `Your Telegram account is now *successfully linked* to your prediction wallet! 🤝\n\n` +
          `You will receive real-time updates directly in this chat:\n` +
          `🔔 *Live match events* (kickoffs, goals)\n` +
          `⚠️ *Prediction deadline reminders* (1 hour before lockout)\n` +
          `💰 *Staking results* & payout summaries\n\n` +
          `💎 *Current Balance:* \`${formattedBalance} Coins\`\n\n` +
          `Good luck with your predictions! ⚽🔥`;

        const sendResult = await sendTelegramMessage(chatId, welcomeText, botToken);
        const status = sendResult.success ? 'SENT' : 'FAILED';
        const errorText = sendResult.error || null;
        
        await logNotification(supabase, 'TELEGRAM_WELCOME', null, { participant_id: participantId, username: cleanUsername, chat_id: chatId }, status, errorText);
        console.log(`Successfully paired Chat ID ${chatId} with Participant: ${displayName}`);

      } else {
        // Welcoming text without deep link parameters
        const introText = `👋 Hello ${firstName}!\n\n` +
          `To enable real-time predictions alerts:\n` +
          `1. Open the *FWC 2026 Predictions* website.\n` +
          `2. Go to your *Profile Settings*.\n` +
          `3. Click the *Pair Telegram Bot* button under Notifications.\n\n` +
          `This will pair your account securely! ⚽🤖`;

        await sendTelegramMessage(chatId, introText, botToken);
      }
    } else {
      // Echo / Help instruction message
      const helpText = `🤖 *FWC 2026 Predictions Bot*\n\n` +
        `This bot delivers real-time notifications for the tournament pool.\n` +
        `Commands:\n` +
        `/start - Trigger account pairing instructions`;
      await sendTelegramMessage(chatId, helpText, botToken);
    }

    return new Response(JSON.stringify({ success: true, message: "Webhook processed successfully" }), {
      headers: corsHeaders,
      status: 200,
    });

  } catch (error) {
    console.error("Webhook processing failed:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "Unknown error occurred" }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});
