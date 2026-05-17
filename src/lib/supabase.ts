import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://acozqpdwoxtwpswmffqz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjb3pxcGR3b3h0d3Bzd21mZnF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NjYzNzQsImV4cCI6MjA5NDU0MjM3NH0.j7yaJ4YwBnp1nIpCquGxYvR3PIVxu_WrqMvln8IAhm4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
