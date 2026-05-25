import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Runs every hour via pg_cron.
// Finds FAILED notifications from the last 2 hours (max 3 retries each)
// and re-sends them directly to the Telegram API using the stored message_text.
// Updates the original log entry so it won't be retried again once resolved.

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

    if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing Supabase env vars.');
    if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN.');

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 2-hour window: only retry recent failures, not stale ones from days ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: failedList, error: fetchErr } = await supabase
      .from('notifications_log')
      .select('id, type, payload, message_text, retry_count')
      .eq('status', 'FAILED')
      .gte('sent_at', twoHoursAgo)
      .lt('retry_count', 3)
      .not('message_text', 'is', null); // skip entries logged before this column existed

    if (fetchErr) throw new Error(`Failed to fetch notifications_log: ${fetchErr.message}`);

    const total = failedList?.length || 0;
    console.log(`Found ${total} failed notification(s) eligible for retry.`);

    let recovered = 0;
    let stillFailing = 0;

    for (const entry of (failedList || [])) {
      const chatId = entry.payload?.chat_id ?? entry.payload?.data?.telegram_chat_id;
      if (!chatId) {
        console.warn(`Skipping ${entry.id}: no chat_id in payload.`);
        continue;
      }

      const newRetryCount = (entry.retry_count || 0) + 1;

      // Call Telegram sendMessage directly — no extra log entries, clear success signal
      const telegramRes = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: Number(chatId),
            text: entry.message_text,
            parse_mode: 'Markdown',
          }),
        }
      );

      if (telegramRes.ok) {
        await supabase
          .from('notifications_log')
          .update({
            status: 'SENT',
            retry_count: newRetryCount,
            error: `Recovered on retry ${newRetryCount}`,
          })
          .eq('id', entry.id);

        console.log(`✅ Recovered ${entry.type} → chat ${chatId} (retry ${newRetryCount})`);
        recovered++;
      } else {
        const errBody = await telegramRes.text();
        await supabase
          .from('notifications_log')
          .update({
            retry_count: newRetryCount,
            error: `Retry ${newRetryCount} failed [${telegramRes.status}]: ${errBody}`,
          })
          .eq('id', entry.id);

        console.warn(`❌ Retry ${newRetryCount} failed for ${entry.id}: ${telegramRes.status} ${errBody}`);
        stillFailing++;
      }
    }

    const message = total === 0
      ? 'No failed notifications to retry.'
      : `Retried ${total}: ${recovered} recovered, ${stillFailing} still failing.`;

    console.log(message);
    return new Response(
      JSON.stringify({ success: true, message, total, recovered, stillFailing }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error('retry-notifications failed:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: corsHeaders, status: 500 }
    );
  }
});
