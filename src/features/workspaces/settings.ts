import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/features/sync/request'
import { workspaceSchema } from './model'

export const settingsSchema = workspaceSchema.extend({
  owner_id: z.string().uuid(),
  description: z.string(),
  timezone: z.string(),
  archived_at: z.string().nullable(),
  version: z.number().int(),
  updated_at: z.string(),
})
export type WorkspaceSettings = z.infer<typeof settingsSchema>
export const activitySchema = z.object({
  id: z.string(),
  actor_id: z.string().nullable(),
  action: z.string(),
  changes: z.record(z.string(), z.unknown()),
  created_at: z.string(),
})
export type WorkspaceActivity = z.infer<typeof activitySchema>
export type SettingsMutation = {
  workspace: string
  version: number
  id: string
  action: string
  data: Record<string, unknown>
}
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await withDeadline((signal) =>
    supabase!.rpc(name, args).abortSignal(signal),
  )
  if (error) throw error
  return data
}
export const settingsApi = {
  get: async (id: string) =>
    settingsSchema.parse(
      await rpc('workspace_settings_get', { p_workspace: id }),
    ),
  activity: async (id: string, before?: string) =>
    activitySchema.array().parse(
      await rpc('workspace_activity_list', {
        p_workspace: id,
        p_before: before ?? null,
        p_limit: 50,
      }),
    ),
  mutate: async (m: SettingsMutation) => {
    const result = await rpc('workspace_mutate', {
      p_workspace: m.workspace,
      p_version: m.version,
      p_mutation: m.id,
      p_action: m.action,
      p_data: m.data,
    })
    return z
      .object({ ok: z.literal(true), mutation_id: z.literal(m.id) })
      .parse(result)
  },
}
