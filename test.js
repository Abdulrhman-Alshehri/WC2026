import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('matches').select('*').order('kickoff_utc');
  console.log('Error:', error);
  console.log('Data count:', data ? data.length : 0);
  if (data && data.length > 0) {
    console.log(data[0]);
  }
}

test();
