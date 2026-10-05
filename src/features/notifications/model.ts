import { z } from 'zod'
export const notificationConfig = {
  path: '/notifications',
  pageSize: 20,
} as const
export const preferenceLabels = {
  assignments: 'Khi được giao việc',
  comments: 'Bình luận trên task đang theo dõi',
  invitations: 'Lời mời workspace',
} as const
export const preferenceSchema = z.object({
  assignments: z.boolean(),
  comments: z.boolean(),
  invitations: z.boolean(),
  version: z.number().int(),
})
export const itemSchema = z.object({
  id: z.string().regex(/^\d+$/),
  kind: z.enum(['assignment', 'comment', 'invitation']),
  workspace_id: z.string().uuid(),
  workspace_name: z.string(),
  task_id: z.string().uuid().nullable(),
  board_id: z.string().uuid().nullable(),
  title: z.string(),
  invitation_id: z.string().uuid().nullable(),
  invitation_role: z.enum(['member', 'viewer']).nullable(),
  created_at: z.string(),
  read: z.boolean(),
  version: z.number().int(),
})
export const feedSchema = z.object({
  items: z.array(itemSchema),
  unread: z.number().int(),
  high_water: z.string(),
  next: z.string().nullable(),
  preferences: preferenceSchema,
})
export const watchSchema = z.object({
  enabled: z.boolean(),
  version: z.number().int(),
  automatic: z.boolean(),
})
export type Feed = z.infer<typeof feedSchema>
export type Notification = z.infer<typeof itemSchema>
export type Preferences = z.infer<typeof preferenceSchema>
export type WatchState = z.infer<typeof watchSchema>
export type Mutation =
  | {
      mutation: string
      action: 'read' | 'read_all' | 'preferences' | 'watch'
      data: Record<string, unknown>
    }
  | { action: 'accept'; invitation: string }
export const kindLabels = {
  assignment: 'Bạn được giao công việc',
  comment: 'Có bình luận mới',
  invitation: 'Bạn được mời vào workspace',
} as const
export function notificationError(cause: unknown) {
  const { code } = (cause ?? {}) as { code?: string }
  if (code === 'PT409')
    return 'Dữ liệu đã thay đổi ở phiên khác. Tải lại trước khi thử lại.'
  if (code === '42501')
    return 'Bạn không còn quyền xem nội dung này hoặc email chưa được xác minh.'
  if (code === 'PGRST202' || code === '42P01')
    return 'Thông báo chưa được thiết lập. Cần áp dụng migration G4.'
  if (code?.startsWith('22') || code?.startsWith('23'))
    return 'Thao tác không hợp lệ hoặc lời mời đã hết hiệu lực. Tải lại để kiểm tra.'
  return 'Chưa xác nhận được kết quả. Kiểm tra kết nối và thử lại.'
}
