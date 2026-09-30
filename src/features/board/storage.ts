import { appConfig } from '@/config/app'
import { boardSchema, type Task } from './model'

export const STORAGE_KEY = appConfig.storage.boardKey

export function loadBoard(
  storage: Pick<Storage, 'getItem'>,
  key: string,
): {
  tasks: Task[]
  error: string
} {
  try {
    const raw = storage.getItem(key)
    if (!raw) return { tasks: [], error: '' }
    return { tasks: boardSchema.parse(JSON.parse(raw)).tasks, error: '' }
  } catch {
    return {
      tasks: [],
      error:
        'Không đọc được dữ liệu đã lưu. Đang hiển thị bảng trống; hãy kiểm tra bộ nhớ trình duyệt trước khi chỉnh sửa.',
    }
  }
}

export function saveBoard(
  storage: Pick<Storage, 'setItem'>,
  tasks: Task[],
  key: string,
) {
  storage.setItem(
    key,
    JSON.stringify(
      boardSchema.parse({ version: appConfig.storage.boardVersion, tasks }),
    ),
  )
}
