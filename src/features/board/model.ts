import { z } from 'zod'

import { statuses, priorities, taskLimits } from './config'
import { appConfig } from '@/config/app'
export { statuses, columns, priorityLabels, type Status } from './config'

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(taskLimits.title),
  description: z.string().max(taskLimits.description),
  status: z.enum(statuses),
  priority: z.enum(priorities),
  assignee: z.string().max(taskLimits.assignee),
  dueDate: z
    .string()
    .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)),
})
export type Task = z.infer<typeof taskSchema>
export type TaskInput = Omit<Task, 'id'>
export const boardSchema = z.object({
  version: z.literal(appConfig.storage.boardVersion),
  tasks: z.array(taskSchema),
})

export function createSeed(): Task[] {
  return [
    {
      id: 'seed-1',
      title: 'Phác thảo luồng làm việc của nhóm',
      description:
        'Xác định các bước từ ý tưởng đến bàn giao. Viết rõ tiêu chí hoàn thành.',
      status: 'todo',
      priority: 'high',
      assignee: 'Minh',
      dueDate: '',
    },
    {
      id: 'seed-2',
      title: 'Chuẩn bị nội dung trang giới thiệu',
      description: 'Một câu giới thiệu, ba lợi ích và lời mời dùng thử.',
      status: 'todo',
      priority: 'medium',
      assignee: 'Linh',
      dueDate: '',
    },
    {
      id: 'seed-3',
      title: 'Thiết kế trải nghiệm bảng công việc',
      description: 'Ưu tiên khả năng đọc, thao tác nhanh và màn hình nhỏ.',
      status: 'doing',
      priority: 'high',
      assignee: 'An',
      dueDate: '',
    },
    {
      id: 'seed-4',
      title: 'Hoàn thiện bộ màu và typography',
      description: 'Kiểm tra dấu tiếng Việt và độ tương phản.',
      status: 'doing',
      priority: 'low',
      assignee: 'Linh',
      dueDate: '',
    },
    {
      id: 'seed-5',
      title: 'Kiểm tra form tạo công việc',
      description: 'Không cho lưu tiêu đề trống; giữ bản nháp khi đang sửa.',
      status: 'review',
      priority: 'medium',
      assignee: 'Minh',
      dueDate: '',
    },
    {
      id: 'seed-6',
      title: 'Thống nhất mục tiêu dự án',
      description: 'Một bảng công việc rõ ràng cho nhóm freelancer nhỏ.',
      status: 'done',
      priority: 'low',
      assignee: 'An',
      dueDate: '',
    },
  ]
}
