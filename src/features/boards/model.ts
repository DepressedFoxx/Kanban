import { z } from 'zod'
import { memberSchema } from '@/features/workspaces/model'
import { statuses, priorities, taskLimits } from '@/features/board/config'
export const boardConfig = {
  nameMaxLength: 80,
  refreshMs: 30000,
  listPath: (workspace: string) => `/workspaces/${workspace}/boards`,
  detailPath: (board: string) => `/boards/${board}`,
} as const
export const boardNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên board.')
  .max(boardConfig.nameMaxLength)
export const onlineBoardSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  archived_at: z.string().nullable(),
  version: z.number().int(),
  created_at: z.string(),
  created_by: z.string().uuid(),
})
export const taskInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'Nhập tên công việc.').max(taskLimits.title),
  description: z.string().max(taskLimits.description),
  status: z.enum(statuses),
  priority: z.enum(priorities),
  assignee_id: z.string().uuid().nullable(),
  due_date: z.union([z.literal(''), z.iso.date()]),
})
export const onlineTaskSchema = taskInputSchema.extend({
  due_date: z.string().nullable(),
  board_id: z.string().uuid(),
  position: z.number().int(),
  archived_at: z.string().nullable(),
})
export const snapshotSchema = z.object({
  board: onlineBoardSchema,
  role: z.enum(['owner', 'member', 'viewer']),
  tasks: z.array(onlineTaskSchema),
  members: z.array(memberSchema),
})
export type OnlineBoard = z.infer<typeof onlineBoardSchema>
export type OnlineTask = z.infer<typeof onlineTaskSchema>
export type TaskDraft = z.infer<typeof taskInputSchema>
export type BoardSnapshot = z.infer<typeof snapshotSchema>
export function boardError(error: unknown) {
  if (error instanceof z.ZodError)
    return 'Dữ liệu không hợp lệ. Kiểm tra tên, hạn hoàn thành và người phụ trách.'
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  const messages: Record<string, string> = {
    BOARD_CONFLICT:
      'Board đã thay đổi. Đã tải bản mới; bản nháp của bạn được giữ lại. Hãy đối chiếu trước khi lưu lại.',
    BOARD_ARCHIVED: 'Board đã lưu trữ, chỉ có thể xem.',
    TASK_ARCHIVED: 'Công việc đã được lưu trữ. Hãy tải lại board.',
    INVALID_ASSIGNEE: 'Người phụ trách không còn thuộc workspace.',
    TASK_NOT_FOUND: 'Công việc không còn tồn tại.',
    OWNER_REQUIRED: 'Chỉ Owner được quản lý board.',
    WRITE_DENIED: 'Viewer chỉ được xem board.',
    WORKSPACE_ACCESS_DENIED:
      'Board không tồn tại hoặc bạn không còn quyền truy cập.',
  }
  if (message && messages[message]) return messages[message]
  if (code === 'PGRST202' || code === '42P01')
    return 'Module board chưa được thiết lập trên Supabase. Hãy chạy migration 202609300002_boards.sql.'
  if (code === '42501') return 'Bạn không còn quyền thực hiện thao tác này.'
  if (code?.startsWith('22') || code?.startsWith('23'))
    return 'Dữ liệu không hợp lệ hoặc bị trùng. Kiểm tra lại thông tin.'
  return 'Chưa xác nhận được kết quả từ máy chủ. Kiểm tra kết nối và thử xác nhận lại thao tác.'
}
