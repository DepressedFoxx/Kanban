import { z } from 'zod'
import { boardError } from '@/features/boards/model'
export const taskConfig = {
  commentMaxLength: 2000,
  pageSize: 50,
  refreshMs: 30000,
} as const
export const commentBodySchema = z
  .string()
  .trim()
  .min(1, 'Nhập nội dung bình luận.')
  .max(taskConfig.commentMaxLength, 'Bình luận tối đa 2.000 ký tự.')
const author = {
  actor_id: z.string().uuid().nullable(),
  actor_name: z.string(),
  created_at: z.string(),
}
export const commentSchema = z.object({
  ...author,
  id: z.string().uuid(),
  body: z.string(),
})
export const activitySchema = z.object({
  ...author,
  id: z.string(),
  action: z.enum(['created', 'updated', 'archived', 'restored']),
  changes: z.record(
    z.string(),
    z.object({ before: z.unknown(), after: z.unknown() }),
  ),
})
export const threadSchema = z.object({
  can_comment: z.boolean(),
  comments: commentSchema.array(),
  activity: activitySchema.array(),
})
export type TaskThread = z.infer<typeof threadSchema>
export type TaskComment = z.infer<typeof commentSchema>
export type TaskActivity = z.infer<typeof activitySchema>
export type ThreadCursor = {
  commentDate?: string
  commentId?: string
  activityId?: string
}
export function taskError(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.'
  const code = (error as { code?: string })?.code
  if (code === 'PGRST202' || code === '42P01')
    return 'Phần bình luận và lịch sử chưa được thiết lập. Cần chạy migration 202609300003_task_details.sql.'
  return boardError(error)
}
export function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function isOverdue(
  dueDate: string | null | undefined,
  status: string,
  now = new Date(),
) {
  return Boolean(dueDate && status !== 'done' && dueDate < localDateKey(now))
}
export function taskLink(board: string, task: string) {
  return `/boards/${board}?task=${task}`
}
