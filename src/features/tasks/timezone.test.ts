import { expect, it } from 'vitest'
import { isOverdue } from './model'
it('uses workspace calendar date across midnight without moving due_date', () => {
  const instant = new Date('2026-10-01T18:00:00Z')
  expect(isOverdue('2026-10-01', 'todo', instant, 'Asia/Bangkok')).toBe(true)
  expect(isOverdue('2026-10-01', 'todo', instant, 'America/New_York')).toBe(
    false,
  )
  expect(isOverdue('2026-10-01', 'todo', instant, 'Asia/Bangkok', true)).toBe(
    false,
  )
})
it('handles leap dates and DST transition', () => {
  expect(
    isOverdue('2024-02-29', 'todo', new Date('2024-03-01T00:01:00Z'), 'UTC'),
  ).toBe(true)
  expect(
    isOverdue(
      '2026-03-08',
      'todo',
      new Date('2026-03-08T07:01:00Z'),
      'America/New_York',
    ),
  ).toBe(false)
  expect(
    isOverdue(
      '2026-03-07',
      'done',
      new Date('2026-03-08T07:01:00Z'),
      'America/New_York',
    ),
  ).toBe(false)
})
it('does not crash or invent overdue status for unsupported timezone', () => {
  expect(isOverdue('2020-01-01', 'todo', new Date(), 'Unknown/Zone')).toBe(
    false,
  )
})
