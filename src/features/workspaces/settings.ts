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
  activity: async (id: string, page = 1, pageSize = 20) =>
    z
      .object({
        items: activitySchema.array(),
        page: z.number().int().positive(),
        pageSize: z.number().int().min(1).max(50),
        total: z.number().int().nonnegative(),
      })
      .parse(
        await rpc('activity_page', {
          p_source: 'workspace_activity',
          p_workspace: id,
          p_page: page,
          p_page_size: pageSize,
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
