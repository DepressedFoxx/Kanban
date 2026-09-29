import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Optional integration point. No privileged secret belongs in VITE_* variables.
export const supabase = url && key ? createClient(url, key) : null
