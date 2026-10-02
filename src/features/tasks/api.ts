import { withDeadline } from '@/features/sync/request'
import { supabase } from '@/lib/supabase'
import { threadSchema, type ThreadCursor } from './model'
async function rpc(name: string, args: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await withDeadline((signal) =>
    supabase!.rpc(name, args).abortSignal(signal),
  )
  if (error) throw error
  return threadSchema.parse(data)
}
export type CommentChange = {
  comment: string
  version: number
  action: 'edit' | 'delete'
  body: string | null
  reason: string | null
}
export const tasksApi = {
  change: (board: string, task: string, id: string, change: CommentChange) =>
    rpc('task_comment_mutate', {
      p_board: board,
      p_task: task,
      p_comment: change.comment,
      p_version: change.version,
      p_mutation: id,
      p_action: change.action,
      p_body: change.body,
      p_reason: change.reason,
    }),
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
