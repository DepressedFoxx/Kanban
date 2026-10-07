import { z } from 'zod'
import { withDeadline } from '@/features/sync/request'
import { supabase } from '@/lib/supabase'
import { boardNameSchema, onlineBoardSchema, snapshotSchema } from './model'
export type BoardQuery = {
  pages: Record<string, number>
  pageSize: number
  filters: Record<string, unknown>
  task: string | null
}
const queryArgs = (q: BoardQuery) => ({
  p_pages: q.pages,
  p_page_size: q.pageSize,
  p_filters: q.filters,
  p_task: q.task,
})
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await withDeadline((signal) =>
    supabase!.rpc(name, args).abortSignal(signal),
  )
  if (error) throw error
  return data
}
export const boardsApi = {
  list: async (workspace: string) =>
    onlineBoardSchema
      .array()
      .parse(await rpc('board_list', { p_workspace: workspace })),
  create: async (workspace: string, id: string, name: string) =>
    z
      .string()
      .uuid()
      .parse(
        await rpc('board_create', {
          p_workspace: workspace,
          p_id: id,
          p_name: boardNameSchema.parse(name),
        }),
      ),
  snapshot: async (board: string, query?: BoardQuery) =>
    snapshotSchema.parse(
      await rpc(query ? 'board_page_query' : 'board_snapshot', {
        p_board: board,
        ...(query ? queryArgs(query) : {}),
      }),
    ),
  mutate: async (
    board: string,
    version: number,
    mutation: string,
    action: string,
    data: Record<string, unknown>,
    query?: BoardQuery,
  ) =>
    snapshotSchema.parse(
      await rpc(query ? 'board_page_mutate' : 'board_mutate', {
        p_board: board,
        p_version: version,
        p_mutation: mutation,
        p_action: action,
        p_data: data,
        ...(query ? queryArgs(query) : {}),
      }),
    ),
}
