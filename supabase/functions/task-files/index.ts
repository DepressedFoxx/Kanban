import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createHandler, type Backend } from './handler.ts'
const url = Deno.env.get('SUPABASE_URL')!
const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
const key = keys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) throw new Error('Server configuration missing')
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
// Dev-local origins only. Add an exact trusted origin when deploying the frontend later.
const origins = [5173, 5180, 5190].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
])
Deno.serve(createHandler(admin as unknown as Backend, origins))
