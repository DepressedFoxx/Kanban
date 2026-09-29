// Shared by validation and UI; keep persisted IDs stable.
export const statuses = ['todo', 'doing', 'review', 'done'] as const
export type Status = (typeof statuses)[number]
export const priorities = ['low', 'medium', 'high'] as const
export const priorityLabels = {
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
} as const
export const taskLimits = {
  title: 120,
  description: 2000,
  assignee: 60,
} as const
export const taskDefaults = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  assignee: '',
  dueDate: '',
} as const
export const columns: { id: Status; label: string; color: string }[] = [
  { id: 'todo', label: 'Cần làm', color: 'var(--status-todo)' },
  { id: 'doing', label: 'Đang làm', color: 'var(--status-doing)' },
  { id: 'review', label: 'Chờ kiểm tra', color: 'var(--status-review)' },
  { id: 'done', label: 'Hoàn thành', color: 'var(--status-done)' },
]
