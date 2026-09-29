import { appConfig } from '@/config/app'
import { boardSchema, createSeed, type Task } from './model'

export const STORAGE_KEY = appConfig.storage.boardKey

export function loadBoard(
  storage: Pick<Storage, 'getItem'>,
  key: string = STORAGE_KEY,
  seed = true,
): {
  tasks: Task[]
  error: string
} {
  try {
    const raw = storage.getItem(key)
    if (!raw) return { tasks: seed ? createSeed() : [], error: '' }
    return { tasks: boardSchema.parse(JSON.parse(raw)).tasks, error: '' }
  } catch {
    return {
      tasks: seed ? createSeed() : [],
      error:
        'Không đọc được dữ liệu đã lưu. Đang hiển thị bảng mẫu; hãy kiểm tra bộ nhớ trình duyệt trước khi chỉnh sửa.',
    }
  }
}

export function saveBoard(
  storage: Pick<Storage, 'setItem'>,
  tasks: Task[],
  key: string = STORAGE_KEY,
) {
  storage.setItem(
    key,
    JSON.stringify(
      boardSchema.parse({ version: appConfig.storage.boardVersion, tasks }),
    ),
  )
}
