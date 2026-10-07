import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/features/sync/request'
import {
  resultSchema,
  myTasksConfig,
  type TaskFilters,
  type FilterMutation,
} from './model'
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw Error('Supabase unavailable')
  const { data, error } = await withDeadline((signal) =>
    supabase!.rpc(name, args).abortSignal(signal),
  )
  if (error) throw error
  return data
}
export const myTasksApi = {
  query: async (
    filters: TaskFilters,
    page: number,
    pageSize: number = myTasksConfig.pageSize,
  ) =>
    resultSchema.parse(
      await rpc('my_tasks_query', {
        p_filters: filters,
        p_page: page,
        p_limit: pageSize,
      }),
    ),
  mutate: async (m: FilterMutation) =>
    z.object({ ok: z.literal(true), mutation_id: z.literal(m.mutation) }).parse(
      await rpc('task_saved_filter_mutate', {
        p_id: m.id,
        p_version: m.version,
        p_mutation: m.mutation,
        p_action: m.action,
        p_name: m.name,
        p_filters: m.filters,
      }),
    ),
}
