import { supabase } from '@/lib/supabase'
import { threadSchema, type ThreadCursor } from './model'
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return threadSchema.parse(data)
}
export const tasksApi = {
  thread: (board: string, task: string, cursor: ThreadCursor = {}) =>
    rpc('task_thread', {
      p_board: board,
      p_task: task,
      p_before_comment: cursor.commentDate ?? null,
      p_before_comment_id: cursor.commentId ?? null,
      p_before_activity: cursor.activityId ?? null,
    }),
  comment: (board: string, task: string, id: string, body: string) =>
    rpc('task_comment_add', {
      p_board: board,
      p_task: task,
      p_id: id,
      p_body: body,
    }),
}
