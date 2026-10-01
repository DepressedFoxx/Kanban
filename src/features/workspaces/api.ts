import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import {
  workspaceSchema,
  memberSchema,
  invitationSchema,
  workspaceNameSchema,
  inviteSchema,
} from './model'
async function rpc(name: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Supabase unavailable')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}
export const workspaceApi = {
  preview: async (token: string) =>
    z
      .object({
        workspace_name: z.string(),
        role: z.enum(['member', 'viewer']),
        expires_at: z.string(),
      })
      .parse(
        await rpc('workspace_invitation_preview', {
          p_token: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(token),
        }),
      ),
  list: async () => workspaceSchema.array().parse(await rpc('workspace_list')),
  members: async (id: string) =>
    memberSchema
      .array()
      .parse(await rpc('workspace_member_list', { p_workspace: id })),
  invitations: async (id: string) =>
    invitationSchema
      .array()
      .parse(await rpc('workspace_invitation_list', { p_workspace: id })),
  create: async (name: string) =>
    z
      .string()
      .uuid()
      .parse(
        await rpc('workspace_create', {
          p_name: workspaceNameSchema.parse(name),
        }),
      ),
  rename: (id: string, name: string) =>
    rpc('workspace_rename', {
      p_workspace: id,
      p_name: workspaceNameSchema.parse(name),
    }),
  invite: async (id: string, email: string, role: string) => {
    const input = inviteSchema.parse({ email, role })
    return z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(
        await rpc('workspace_invite', {
          p_workspace: id,
          p_email: input.email,
          p_role: input.role,
        }),
      )
  },
  changeRole: (id: string, user: string, role: string) =>
    rpc('workspace_member_change', {
      p_workspace: id,
      p_user: user,
      p_role: z.enum(['member', 'viewer']).parse(role),
    }),
  remove: (id: string, user: string) =>
    rpc('workspace_member_remove', { p_workspace: id, p_user: user }),
  revoke: (id: string, invitation: string) =>
    rpc('workspace_invitation_revoke', {
      p_workspace: id,
      p_invitation: invitation,
    }),
  accept: async (token: string) =>
    z
      .string()
      .uuid()
      .parse(
        await rpc('workspace_invitation_accept', {
          p_token: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(token),
        }),
      ),
}
