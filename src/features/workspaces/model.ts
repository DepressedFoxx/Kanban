import { z } from 'zod'
import { workspaceConfig } from './config'
export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên workspace.')
  .max(workspaceConfig.nameMaxLength, 'Tên tối đa 80 ký tự.')
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ.').max(254),
  role: z.enum(['member', 'viewer']),
})
export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(['owner', 'member', 'viewer']),
  created_at: z.string(),
})
export const memberSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string(),
  email: z.string(),
  role: z.enum(['owner', 'member', 'viewer']),
  joined_at: z.string(),
})
export const invitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.enum(['member', 'viewer']),
  created_at: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  accepted_at: z.string().nullable(),
})
export type Workspace = z.infer<typeof workspaceSchema>
export type Member = z.infer<typeof memberSchema>
export type Invitation = z.infer<typeof invitationSchema>
export function invitationStatus(invite: Invitation) {
  if (invite.accepted_at) return 'Đã tham gia'
  if (invite.revoked_at) return 'Đã thu hồi'
  return Date.parse(invite.expires_at) <= Date.now() ? 'Hết hạn' : 'Đang chờ'
}
export function workspaceError(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.'
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  const messages: Record<string, string> = {
    OWNER_REQUIRED: 'Chỉ Owner được thực hiện thao tác này.',
    VERIFIED_ACCOUNT_REQUIRED:
      'Bạn cần đăng nhập bằng tài khoản đã xác minh email.',
    WORKSPACE_ACCESS_DENIED:
      'Workspace không tồn tại hoặc bạn không còn quyền truy cập.',
    MEMBER_NOT_EDITABLE: 'Không thể thay đổi Owner hoặc thành viên đã bị gỡ.',
    ALREADY_MEMBER: 'Email này đã là thành viên của workspace.',
    INVITATION_INVALID: 'Lời mời không hợp lệ, đã hết hạn hoặc đã bị thu hồi.',
    INVITATION_EMAIL_MISMATCH: 'Hãy đăng nhập bằng đúng email được mời.',
    INVALID_ROLE: 'Chỉ được chọn Member hoặc Viewer.',
  }
  if (message && messages[message]) return messages[message]
  if (code === 'PGRST202' || code === '42P01')
    return 'Dịch vụ workspace chưa được thiết lập. Vui lòng liên hệ người quản lý ứng dụng.'
  if (code === '42501') return 'Bạn không có quyền thực hiện thao tác này.'
  return 'Không kết nối được workspace. Kiểm tra kết nối rồi thử tải lại trước khi gửi lại thao tác.'
}
