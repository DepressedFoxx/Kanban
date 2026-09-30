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
