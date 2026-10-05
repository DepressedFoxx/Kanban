import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/features/sync/request'
import {
  feedSchema,
  watchSchema,
  notificationConfig,
  type Mutation,
} from './model'
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw Error('Supabase unavailable')
  const { data, error } = await withDeadline((signal) =>
    supabase!.rpc(name, args).abortSignal(signal),
  )
  if (error) throw error
  return data
}
export const notificationsApi = {
  feed: async (before: string | null, unread: boolean) =>
    feedSchema.parse(
      await rpc('notification_feed', {
        p_before: before,
        p_unread: unread,
        p_limit: notificationConfig.pageSize,
      }),
    ),
  watch: async (task: string) =>
    watchSchema.parse(await rpc('task_watch_get', { p_task: task })),
  mutate: async (m: Mutation) => {
    if (m.action === 'accept')
      return z
        .string()
        .uuid()
        .parse(
          await rpc('notification_invitation_accept', {
            p_invitation: m.invitation,
          }),
        )
    return z
      .object({ ok: z.literal(true), mutation_id: z.literal(m.mutation) })
      .parse(
        await rpc('notification_mutate', {
          p_mutation: m.mutation,
          p_action: m.action,
          p_data: m.data,
        }),
      )
  },
}
