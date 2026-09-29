import { boardSchema, createSeed, type Task } from './model'

export const STORAGE_KEY = 'kanban.board.v1'

export function loadBoard(storage: Pick<Storage, 'getItem'>): {
  tasks: Task[]
  error: string
} {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { tasks: createSeed(), error: '' }
    return { tasks: boardSchema.parse(JSON.parse(raw)).tasks, error: '' }
  } catch {
    return {
      tasks: createSeed(),
      error:
        'Không đọc được dữ liệu đã lưu. Đang hiển thị bảng mẫu; hãy kiểm tra bộ nhớ trình duyệt trước khi chỉnh sửa.',
    }
  }
}

export function saveBoard(storage: Pick<Storage, 'setItem'>, tasks: Task[]) {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify(boardSchema.parse({ version: 1, tasks })),
  )
}
