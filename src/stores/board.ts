import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  taskSchema,
  type Status,
  type Task,
  type TaskInput,
} from '@/features/board/model'
import { STORAGE_KEY, loadBoard, saveBoard } from '@/features/board/storage'

export const useBoardStore = defineStore('board', () => {
  const tasks = ref<Task[]>([])
  const storageError = ref('')
  let storageKey: string | null = null
  function setScope(userId: string) {
    if (!userId) throw new Error('Board requires an account')
    storageKey = STORAGE_KEY + '.' + userId
    tasks.value = []
    storageError.value = ''
    initialize()
  }
  function clear() {
    storageKey = null
    tasks.value = []
    storageError.value = ''
  }
  const completed = computed(
    () => tasks.value.filter((task) => task.status === 'done').length,
  )

  function initialize() {
    if (!storageKey) return
    try {
      const result = loadBoard(localStorage, storageKey)
      tasks.value = result.tasks
      storageError.value = result.error
    } catch {
      storageError.value =
        'Trình duyệt đang chặn bộ nhớ. Thay đổi chỉ tồn tại trong phiên này.'
    }
  }

  function persist() {
    if (!storageKey) return
    try {
      saveBoard(localStorage, tasks.value, storageKey)
      storageError.value = ''
    } catch {
      storageError.value =
        'Chưa lưu được vào trình duyệt. Đừng đóng trang trước khi sao chép nội dung cần giữ.'
    }
  }

  function save(input: TaskInput, id?: string) {
    const task = taskSchema.parse({ ...input, id: id ?? crypto.randomUUID() })
    const index = tasks.value.findIndex((item) => item.id === task.id)
    if (index >= 0) tasks.value[index] = task
    else tasks.value.push(task)
    persist()
  }

  function remove(id: string) {
    tasks.value = tasks.value.filter((task) => task.id !== id)
    persist()
  }

  function move(id: string, status: Status) {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    task.status = status
    tasks.value = [...tasks.value.filter((item) => item.id !== id), task]
    persist()
  }

  // Called by draggable's v-model for each affected column. IDs are the source
  // of identity; unrelated columns retain their cards and order.
  function reorder(status: Status, ordered: Task[]) {
    const ids = new Set(ordered.map((task) => task.id))
    tasks.value = [
      ...tasks.value.filter(
        (task) => task.status !== status && !ids.has(task.id),
      ),
      ...ordered.map((task) => ({ ...task, status })),
    ]
    persist()
  }

  return {
    setScope,
    clear,
    tasks,
    completed,
    storageError,
    save,
    remove,
    move,
    reorder,
  }
})
