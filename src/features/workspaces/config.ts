export const workspaceConfig = {
  nameMaxLength: 80,
  invitationDays: 7,
  listPath: '/workspaces',
  detailPath: (id: string) => `/workspaces/${id}/members`,
  invitePath: (token: string) => `/invite/${token}`,
} as const
export const roleLabels = {
  owner: 'Owner',
  member: 'Member',
  viewer: 'Viewer',
} as const
export type WorkspaceRole = keyof typeof roleLabels
