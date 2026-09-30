// Static application configuration. User preferences belong in a store.
export const appConfig = {
  name: 'kanban',
  workspaceName: 'Cá nhân',
  locale: 'vi',
  storage: { boardKey: 'kanban.board.v1', boardVersion: 1 },
  routes: { board: '/board', guide: '/guide' },
  dragAnimationMs: 180,
} as const
