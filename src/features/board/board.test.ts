import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBoardStore } from '@/stores/board'
import { loadBoard, STORAGE_KEY } from './storage'

let values: Map<string, string>

beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  setActivePinia(createPinia())
})

describe('board behavior', () => {
  it('saves, reloads and removes a task', () => {
    const board = useBoardStore()
    board.save({
      title: '  Viết tài liệu  ',
      description: '',
      status: 'todo',
      priority: 'high',
      assignee: '',
      dueDate: '',
    })
    const saved = board.tasks.at(-1)!
    expect(saved.title).toBe('Viết tài liệu')
    expect(loadBoard(localStorage).tasks.at(-1)?.id).toBe(saved.id)
    board.remove(saved.id)
    expect(
      loadBoard(localStorage).tasks.some((task) => task.id === saved.id),
    ).toBe(false)
  })

  it('rejects blank titles without mutating the board', () => {
    const board = useBoardStore()
    const original = board.tasks.length
    expect(() =>
      board.save({
        title: '  ',
        description: '',
        status: 'todo',
        priority: 'low',
        assignee: '',
        dueDate: '',
      }),
    ).toThrow()
    expect(board.tasks).toHaveLength(original)
  })

  it.each(['source-first', 'target-first'])(
    'moves between columns without duplicate or missing cards (%s)',
    (order) => {
      const board = useBoardStore()
      const originalIds = board.tasks.map((task) => task.id).sort()
      const source = board.tasks.filter((task) => task.status === 'todo')
      const target = board.tasks.filter((task) => task.status === 'doing')
      const moving = source[0]!
      const actions = [
        () => board.reorder('todo', source.slice(1)),
        () => board.reorder('doing', [...target, moving]),
      ]
      if (order === 'target-first') actions.reverse()
      actions.forEach((action) => action())
      expect(board.tasks.map((task) => task.id).sort()).toEqual(originalIds)
      expect(board.tasks.find((task) => task.id === moving.id)?.status).toBe(
        'doing',
      )
      expect(loadBoard(localStorage).tasks).toEqual(board.tasks)
    },
  )

  it('preserves other columns during within-column reorder', () => {
    const board = useBoardStore()
    const others = board.tasks.filter((task) => task.status !== 'todo')
    const reversed = board.tasks
      .filter((task) => task.status === 'todo')
      .reverse()
    board.reorder('todo', reversed)
    expect(board.tasks.filter((task) => task.status === 'todo')).toEqual(
      reversed,
    )
    expect(board.tasks.filter((task) => task.status !== 'todo')).toEqual(others)
  })

  it('reports invalid stored data instead of crashing', () => {
    values.set(STORAGE_KEY, '{broken')
    expect(loadBoard(localStorage).error).not.toBe('')
    expect(loadBoard(localStorage).tasks.length).toBeGreaterThan(0)
  })

  it('keeps a visible error if storage is full', () => {
    const board = useBoardStore()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    board.move(board.tasks[0]!.id, 'done')
    expect(board.storageError).not.toBe('')
  })
})

describe('account storage isolation', () => {
  it('keeps demo and two account boards separate and clears UI state', () => {
    const board = useBoardStore()
    const demoIds = board.tasks.map((task) => task.id)
    board.setScope('user-a')
    expect(board.tasks).toHaveLength(0)
    board.save({
      title: 'Private A',
      description: '',
      status: 'todo',
      priority: 'low',
      assignee: '',
      dueDate: '',
    })
    board.setScope('user-b')
    expect(board.tasks).toHaveLength(0)
    board.setScope('user-a')
    expect(board.tasks[0]?.title).toBe('Private A')
    board.clear()
    expect(board.tasks).toHaveLength(0)
    board.setScope(null)
    expect(board.tasks.map((task) => task.id)).toEqual(demoIds)
  })
})
