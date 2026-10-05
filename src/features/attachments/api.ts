import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/features/sync/request'
export const attachmentConfig = {
  maxBytes: 10 * 1024 * 1024,
  maxFiles: 20,
  quotaBytes: 500 * 1024 * 1024,
  accept: '.png,.jpg,.jpeg,.webp,.pdf,.txt',
  timeoutMs: 60000,
} as const
const attachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  size: z.number(),
  mime: z.string(),
  sha256: z.string(),
  uploader_id: z.string().uuid(),
  created_at: z.string(),
  can_delete: z.boolean(),
  requires_reason: z.boolean(),
})
const listSchema = z.object({
  writable: z.boolean(),
  role: z.string(),
  used_bytes: z.number(),
  items: attachmentSchema.array(),
})
export type Attachment = z.infer<typeof attachmentSchema>
export type AttachmentList = z.infer<typeof listSchema>
export class AttachmentError extends Error {
  constructor(
    public code: string,
    public uncertain = false,
  ) {
    super(code)
  }
}
async function invoke(
  action: string,
  body: BodyInit,
  headers: Record<string, string> = {},
) {
  if (!supabase) throw new AttachmentError('UNAVAILABLE')
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error || !session) throw new AttachmentError('UNAUTHORIZED')
  // The shared Supabase client has a 15s REST deadline; file transfers use a bounded 60s request.
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/task-files`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'x-action': action,
        ...headers,
      },
      body,
      signal: AbortSignal.timeout(attachmentConfig.timeoutMs),
    },
  )
  const data = await response.json()
  if (!response.ok)
    throw new AttachmentError(
      data.code ?? 'UNAVAILABLE',
      response.status >= 500,
    )
  return data
}
export const attachmentsApi = {
  async list(task: string) {
    if (!supabase) throw new Error('Unavailable')
    const { data, error } = await withDeadline((signal) =>
      supabase!.rpc('attachment_list', { p_task: task }).abortSignal(signal),
    )
    if (error) throw error
    return listSchema.parse(data)
  },
  upload: (task: string, id: string, file: File) =>
    invoke('upload', file, {
      'Content-Type': 'application/octet-stream',
      'x-task-id': task,
      'x-attachment-id': id,
      'x-file-name': encodeURIComponent(file.name),
    }),
  remove: (id: string, receipt: string, reason: string) =>
    invoke('delete', JSON.stringify({ id, receipt, reason }), {
      'Content-Type': 'application/json',
    }),
  async download(id: string): Promise<string> {
    const data = await invoke('download', JSON.stringify({ id }), {
      'Content-Type': 'application/json',
    })
    const url = new URL(data.url)
    if (
      url.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin ||
      !url.pathname.includes('/storage/v1/object/sign/')
    )
      throw new Error('Invalid download URL')
    return url.href
  },
  async export(workspace: string) {
    if (!supabase) throw new Error('Unavailable')
    const { data, error } = await withDeadline((signal) =>
      supabase!
        .rpc('workspace_export', { p_workspace: workspace })
        .abortSignal(signal),
    )
    if (error) throw error
    if (data?.schema_version !== 1) throw new Error('Invalid export')
    return data
  },
}
export function attachmentError(error: unknown) {
  const code = (error as { code?: string })?.code
  const messages: Record<string, string> = {
    ACCESS_DENIED: 'Bạn không còn quyền thao tác với file này.',
    42501: 'Bạn không còn quyền truy cập công việc.',
    UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    ATTACHMENT_COUNT_LIMIT: 'Mỗi công việc tối đa 20 file.',
    ATTACHMENT_QUOTA: 'Workspace đã dùng hết dung lượng 500 MiB.',
    FILE_TOO_LARGE: 'File phải có dung lượng từ 1 byte đến 10 MiB.',
    INVALID_FILENAME: 'Tên file không hợp lệ.',
    UNSUPPORTED_FILE_CONTENT:
      'Nội dung file không phù hợp. Chỉ hỗ trợ PNG, JPEG, WebP, PDF hoặc TXT UTF-8.',
    DELETE_REASON_REQUIRED: 'Nhập lý do xoá file của thành viên khác.',
    RECEIPT_CONFLICT: 'Yêu cầu này đã được dùng cho một thao tác khác.',
    ATTACHMENT_EXPIRED: 'Lượt tải lên đã hết hạn. Hãy chọn lại file.',
  }
  return (
    messages[code ?? ''] ??
    'Chưa xác nhận được kết quả. Hãy thử lại để đối chiếu cùng thao tác.'
  )
}
export function uncertain(error: unknown) {
  return !(error instanceof AttachmentError) || error.uncertain
}
export function formatBytes(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}
