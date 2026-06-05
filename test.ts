import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL || '', env.VITE_SUPABASE_ANON_KEY || '');
async function run() {
  const { data, error } = await supabase.from('assessments').select('*').limit(1);
  console.log("Data:", JSON.stringify(data));
  console.log("Error:", JSON.stringify(error));
}
run();
