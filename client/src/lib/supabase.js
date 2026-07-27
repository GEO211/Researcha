import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oejvlgmoxefwwawqdpwo.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const supabase = supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;
