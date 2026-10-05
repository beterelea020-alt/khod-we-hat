import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tlwsowuuczmmwhzjivut.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TnTAYpSryIQjgyxT6vE0kw_S_IjY3Ag';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);