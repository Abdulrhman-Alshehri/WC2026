import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ──────────────────────────────────────────────────────────────────────────
// Deadline reminders
//
// Runs every 5 minutes via pg_cron. Finds matches whose prediction window
// closes in ~2 hours and pings every paired participant who has NOT yet placed
// a prediction on that match. Reuses the telegram-webhook renderer/logger by
// POSTing a `deadline_reminder` event, so message formatting lives in one place.
//
// Dedup: a participant is only reminded once per match. We check
// notifications_log for an existing TELEGRAM_DEADLINE_REMINDER row for the
// (match_id, participant_id) pair before sending.
// ──────────────────────────────────────────────────────────────────────────

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
    if (!supabaseUrl || !supabaseServiceRoleKey) throw new Error('Missing Supabase env vars.');

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Reminder window: prediction_close between now+1h55m and now+2h5m.
    // The 10-minute band tolerates the 5-minute cron cadence; dedup prevents
    // a second send if a match appears in two consecutive runs.
    const now = Date.now();
    const windowStart = new Date(now + (1 * 60 + 55) * 60 * 1000).toISOString();
    const windowEnd = new Date(now + (2 * 60 + 5) * 60 * 1000).toISOString();

    const { data: matches, error: matchErr } = await supabase
      .from('matches')
      .select('id, home_team, away_team, home_team_code, away_team_code, stage, group_name, prediction_close, status')
      .eq('status', 'NS')
      .gte('prediction_close', windowStart)
      .lte('prediction_close', windowEnd);

    if (matchErr) throw new Error(`Failed to fetch matches: ${matchErr.message}`);

    const upcoming = matches || [];
    console.log(`Found ${upcoming.length} match(es) entering the 2h reminder window.`);

    let sent = 0;
    let skipped = 0;

    for (const match of upcoming) {
      // All active, paired participants.
      const { data: paired } = await supabase
        .from('participants')
        .select('id, telegram_chat_id')
        .eq('is_active', true)
        .not('telegram_chat_id', 'is', null);

      // Participants who already have a prediction on this match.
      const { data: preds } = await supabase
        .from('predictions')
        .select('participant_id')
        .eq('match_id', match.id);
      const predicted = new Set((preds || []).map((p) => p.participant_id));

      // Participants already reminded for this match (dedup).
      const { data: already } = await supabase
        .from('notifications_log')
        .select('participant_id')
        .eq('type', 'TELEGRAM_DEADLINE_REMINDER')
        .eq('match_id', match.id);
      const reminded = new Set((already || []).map((r) => r.participant_id));

      for (const person of (paired || [])) {
        if (predicted.has(person.id) || reminded.has(person.id)) {
          skipped++;
          continue;
        }

        // Pull the participant's current liquid balance for the message.
        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('participant_id', person.id)
          .single();

        const resp = await fetch(`${supabaseUrl}/functions/v1/telegram-webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          },
          body: JSON.stringify({
            event: 'deadline_reminder',
            chat_id: person.telegram_chat_id,
            data: {
              participant_id: person.id,
              match_id: match.id,
              home_team: match.home_team,
              away_team: match.away_team,
              home_team_code: match.home_team_code,
              away_team_code: match.away_team_code,
              stage: match.stage,
              group_name: match.group_name,
              prediction_close: match.prediction_close,
              balance: wallet?.balance ?? 0,
            },
          }),
        });

        if (resp.ok) sent++;
        else {
          skipped++;
          console.warn(`Reminder failed for participant ${person.id} / match ${match.id}: ${resp.status}`);
        }
      }
    }

    const message = `Deadline reminders: ${sent} sent, ${skipped} skipped across ${upcoming.length} match(es).`;
    console.log(message);
    return new Response(JSON.stringify({ success: true, message, sent, skipped, matches: upcoming.length }), {
      headers: corsHeaders,
    });

  } catch (error) {
    console.error('deadline-reminders failed:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Unknown error' }), {
      headers: corsHeaders, status: 500,
    });
  }
});
