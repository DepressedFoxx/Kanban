import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { boardNameSchema, onlineBoardSchema, snapshotSchema } from './model'
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await supabase.rpc(name, args)
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
  snapshot: async (board: string) =>
    snapshotSchema.parse(await rpc('board_snapshot', { p_board: board })),
  mutate: async (
    board: string,
    version: number,
    mutation: string,
    action: string,
    data: Record<string, unknown>,
  ) =>
    snapshotSchema.parse(
      await rpc('board_mutate', {
        p_board: board,
        p_version: version,
        p_mutation: mutation,
        p_action: action,
        p_data: data,
      }),
    ),
}
