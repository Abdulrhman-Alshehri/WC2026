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

async function sendTelegramMessage(chatId: number, text: string, botToken: string) {
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
      console.error(`Telegram API error: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
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

      if (!targetChatId) {
        return new Response(JSON.stringify({ success: false, error: "No Telegram Chat ID found for notification" }), {
          headers: corsHeaders,
          status: 200,
        });
      }

      let text = "";
      if (event === 'test') {
        text = `🔔 *FWC 2026 Prediction Pool Notification Test*\n\n` +
          `Your Telegram pairing is active and working perfectly! 🎉\n\n` +
          `💰 *Current Balance:* \`${data.balance} Coins\`\n\n` +
          `You will receive alerts here for goal scores and predictions resolution! ⚽🤖`;
      } else if (event === 'prediction_placed') {
        text = `🎯 *Prediction Placed!* ⚽\n\n` +
          `You successfully staked *${data.stake} Coins* on the match:\n` +
          `🆚 *${data.home_team} vs ${data.away_team}*\n` +
          `📝 *Your Choice:* \`${data.prediction}\`\n\n` +
          `💎 *New Liquid Balance:* \`${data.balance} Coins\`\n` +
          `Good luck! 🏆`;
      } else if (event === 'prediction_cancelled') {
        text = `❌ *Prediction Cancelled!*\n\n` +
          `Your prediction on *${data.home_team} vs ${data.away_team}* has been cancelled.\n` +
          `💰 *Stake Refunded:* \`+${data.stake} Coins\`\n\n` +
          `💎 *New Liquid Balance:* \`${data.balance} Coins\``;
      } else if (event === 'prediction_resolved') {
        const isWin = data.status === 'WON';
        text = isWin 
          ? `🎉 *Staking Win! Payout Processed!* 💰\n\n` +
            `Match *${data.home_team} vs ${data.away_team}* is resolved.\n` +
            `🏁 *Result:* \`${data.home_score} - ${data.away_score}\`\n\n` +
            `📈 *Prediction:* \`${data.prediction}\` (WON)\n` +
            `💸 *Staked:* \`${data.stake} Coins\`\n` +
            `🎁 *Net Payout:* \`+${data.payout} Coins\` (Profit: +${data.profit} Coins) 🎉\n\n` +
            `💎 *New Liquid Balance:* \`${data.balance} Coins\``
          : `💔 *Prediction Settled*\n\n` +
            `Match *${data.home_team} vs ${data.away_team}* is resolved.\n` +
            `🏁 *Result:* \`${data.home_score} - ${data.away_score}\`\n\n` +
            `📈 *Prediction:* \`${data.prediction}\` (LOST)\n` +
            `💸 *Staked:* \`${data.stake} Coins\` (Lost)\n\n` +
            `💎 *New Liquid Balance:* \`${data.balance} Coins\``;
      }

      if (text) {
        await sendTelegramMessage(Number(targetChatId), text, botToken);
      }

      return new Response(JSON.stringify({ success: true, message: "Notification sent successfully" }), {
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
          ? new Intl.NumberFormat('en-US').format(Number(wallet.balance))
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

        await sendTelegramMessage(chatId, welcomeText, botToken);
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
