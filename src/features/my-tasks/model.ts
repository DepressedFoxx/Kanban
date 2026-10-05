import { z } from 'zod'
import { statuses, priorities } from '@/features/board/config'
export const myTasksConfig = {
  path: '/my-tasks',
  pageSize: 20,
  maxSaved: 20,
  nameLength: 60,
  searchLength: 100,
} as const
export const views = {
  open: 'Đang mở',
  all: 'Tất cả',
  overdue: 'Quá hạn',
  today: 'Hôm nay',
  upcoming: '7 ngày tới',
  completed: 'Đã hoàn thành',
} as const
export const sorts = {
  due: 'Hạn gần nhất',
  priority: 'Ưu tiên cao trước',
  newest: 'Mới tạo trước',
  title: 'Tên A–Z',
} as const
const optionalId = z.union([z.literal(''), z.string().uuid()])
const optionalDate = z.union([z.literal(''), z.iso.date()])
export const filtersSchema = z
  .object({
    view: z
      .enum(['open', 'all', 'overdue', 'today', 'upcoming', 'completed'])
      .default('open'),
    workspace: optionalId.default(''),
    board: optionalId.default(''),
    label: optionalId.default(''),
    status: z.union([z.literal(''), z.enum(statuses)]).default(''),
    priority: z.union([z.literal(''), z.enum(priorities)]).default(''),
    from: optionalDate.default(''),
    to: optionalDate.default(''),
    search: z.string().trim().max(myTasksConfig.searchLength).default(''),
    sort: z.enum(['due', 'priority', 'newest', 'title']).default('due'),
  })
  .strict()
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
  })
export type TaskFilters = z.infer<typeof filtersSchema>
export const defaultFilters = () => filtersSchema.parse({})
const option = z.object({ id: z.string().uuid(), name: z.string() })
const label = option.extend({ color: z.string() })
export const savedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  version: z.number().int(),
  filters: filtersSchema,
})
export type SavedFilter = z.infer<typeof savedSchema>
export const resultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      board_id: z.string().uuid(),
      title: z.string(),
      description: z.string(),
      status: z.enum(statuses),
      priority: z.enum(priorities),
      due_date: z.string().nullable(),
      created_at: z.string(),
      board_name: z.string(),
      workspace_id: z.string().uuid(),
      workspace_name: z.string(),
      timezone: z.string(),
      today: z.string(),
      overdue: z.boolean(),
      labels: z.array(label),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  filters: filtersSchema,
  options: z.object({
    workspaces: z.array(option),
    boards: z.array(option.extend({ workspace_id: z.string().uuid() })),
    labels: z.array(label.extend({ workspace_id: z.string().uuid() })),
  }),
  saved: z.array(savedSchema),
})
export type TaskResults = z.infer<typeof resultSchema>
export type FilterMutation = {
  id: string
  version: number
  mutation: string
  action: 'save' | 'delete'
  name: string
  filters: TaskFilters
}
export function filtersQuery(filters: TaskFilters, page = 1) {
  return Object.fromEntries([
    ...Object.entries(filters).filter(([, v]) => v !== ''),
    ['page', String(page)],
  ])
}
export function parseQuery(query: Record<string, unknown>) {
  const { page = '1', ...rest } = query
  const n = typeof page === 'string' && /^\d+$/.test(page) ? Number(page) : NaN
  if (!Number.isInteger(n) || n < 1 || n > 100000)
    throw Error('Trang không hợp lệ.')
  return { filters: filtersSchema.parse(rest), page: n }
}
export function isMyTasksPath(path: unknown): boolean {
  if (typeof path !== 'string' || path.length > 2500) return false
  try {
    const url = new URL(path, 'http://local')
    if (
      !path.startsWith('/my-tasks') ||
      url.origin !== 'http://local' ||
      url.pathname !== '/my-tasks' ||
      url.hash
    )
      return false
    const entries = [...url.searchParams.entries()]
    if (new Set(entries.map(([k]) => k)).size !== entries.length) return false
    parseQuery(Object.fromEntries(entries))
    return true
  } catch {
    return false
  }
}
export function myTasksError(cause: unknown) {
  const { code, message } = (cause ?? {}) as { code?: string; message?: string }
  if (cause instanceof z.ZodError)
    return cause.issues[0]?.message ?? 'Bộ lọc không hợp lệ.'
  if (code === 'PGRST202' || code === '42P01')
    return 'My Tasks chưa được thiết lập trên Supabase. Cần áp dụng migration G3.'
  if (code === 'PT409')
    return 'Bộ lọc đã lưu đã thay đổi. Tải lại và chọn bản mới trước khi cập nhật.'
  if (code === '42501')
    return 'Bạn không còn quyền truy cập hoặc phiên đăng nhập cần xác minh lại.'
  if (message === 'FILTER_LIMIT')
    return 'Bạn đã có 20 bộ lọc. Xóa một bộ lọc trước khi tạo thêm.'
  if (code === '23505') return 'Tên bộ lọc đã được dùng. Hãy chọn tên khác.'
  if (code?.startsWith('22') || code?.startsWith('23'))
    return 'Bộ lọc hoặc dữ liệu lưu không hợp lệ.'
  return 'Chưa tải/xác nhận được dữ liệu. Kiểm tra kết nối rồi thử lại.'
}
