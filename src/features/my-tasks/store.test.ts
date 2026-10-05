import { beforeEach, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMyTasksStore } from '@/stores/myTasks'
import {
  defaultFilters,
  filtersQuery,
  isMyTasksPath,
  parseQuery,
} from './model'
import { safeRedirect } from '@/features/auth/navigation'
const api = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }))
vi.mock('./api', () => ({ myTasksApi: api }))
const empty = () => ({
  items: [],
  total: 0,
  page: 1,
  limit: 20,
  filters: defaultFilters(),
  options: { workspaces: [], boards: [], labels: [] },
  saved: [],
})
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  api.query.mockResolvedValue(empty())
})
it('ignores old query results and responses after logout', async () => {
  let finish!: (v: unknown) => void
  api.query.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const store = useMyTasksStore(),
    old = store.load()
  await store.load({ ...defaultFilters(), search: 'new' })
  finish({ ...empty(), total: 99 })
  await old
  expect(store.result?.total).toBe(0)
  expect(store.filters.search).toBe('new')
  api.query.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const late = store.load()
  store.clear()
  finish(empty())
  await late
  expect(store.result).toBeNull()
})
it('background failures remove stale private results without changing filter drafts', async () => {
  const store = useMyTasksStore()
  await store.load({ ...defaultFilters(), search: 'keep' })
  api.query.mockRejectedValueOnce({ code: '42501' })
  await store.load(store.filters, 1, true)
  expect(store.result).toBeNull()
  expect(store.filters.search).toBe('keep')
  expect(store.error).toBeTruthy()
})
it('retries detached mutation with same receipt, prevents a second write', async () => {
  const store = useMyTasksStore(),
    filters = defaultFilters()
  api.mutate
    .mockRejectedValueOnce(new Error('lost response'))
    .mockResolvedValueOnce({})
  const m = {
    id: crypto.randomUUID(),
    version: 0,
    action: 'save' as const,
    name: 'Mine',
    filters,
  }
  expect(await store.save(m)).toBe(false)
  filters.search = 'changed'
  expect(await store.save(m)).toBe(false)
  expect(await store.retry()).toBe(true)
  expect(api.mutate.mock.calls[1]).toEqual(api.mutate.mock.calls[0])
  expect(api.mutate.mock.calls[1]![0].filters.search).toBe('')
  expect(store.uncertain).toBeNull()
})
it('conflicts are definitive; acknowledged save survives subsequent read failure', async () => {
  const store = useMyTasksStore(),
    m = {
      id: crypto.randomUUID(),
      version: 0,
      action: 'save' as const,
      name: 'Mine',
      filters: defaultFilters(),
    }
  api.mutate.mockRejectedValueOnce({ code: 'PT409' })
  expect(await store.save(m)).toBe(false)
  expect(store.uncertain).toBeNull()
  api.mutate.mockResolvedValueOnce({})
  api.query.mockRejectedValueOnce(new Error('offline'))
  expect(await store.save(m)).toBe(true)
  expect(store.notice).toBe('Đã lưu bộ lọc.')
  expect(store.error).toBeTruthy()
})
it('roundtrips allowlisted filters and blocks arbitrary redirects', () => {
  const filters = {
    ...defaultFilters(),
    search: 'a & b',
    view: 'today' as const,
  }
  expect(parseQuery(filtersQuery(filters, 2))).toEqual({ filters, page: 2 })
  const path = '/my-tasks?' + new URLSearchParams(filtersQuery(filters, 2))
  expect(isMyTasksPath(path)).toBe(true)
  expect(safeRedirect(path)).toBe(path)
  for (const bad of [
    'https://evil.test/my-tasks',
    '//evil.test/my-tasks',
    '/my-tasks?search=a&search=b',
    '/my-tasks?page=0',
    '/my-tasks?user=1',
    '/my-tasks#x',
  ])
    expect(isMyTasksPath(bad)).toBe(false)
  const task =
    '/boards/20000000-0000-4000-8000-000000000001?task=30000000-0000-4000-8000-000000000001&returnTo=' +
    encodeURIComponent(path)
  expect(safeRedirect(task)).toBe(task)
  expect(
    safeRedirect(
      task.replace(encodeURIComponent(path), encodeURIComponent('//evil.test')),
    ),
  ).not.toBe(task)
})
