import { z } from 'zod'
import { authConfig } from './config'
export const emailSchema = z
  .string()
  .trim()
  .email('Email không hợp lệ.')
  .max(254)
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Nhập tên hiển thị.')
  .max(authConfig.maxDisplayNameLength, 'Tên tối đa 60 ký tự.')
export const passwordSchema = z
  .string()
  .min(authConfig.minPasswordLength, 'Mật khẩu cần ít nhất 8 ký tự.')
  .max(authConfig.maxPasswordLength, 'Mật khẩu tối đa 128 ký tự.')
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Nhập mật khẩu.'),
})
export const registerSchema = z
  .object({
    email: emailSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp.',
    path: ['confirmPassword'],
  })
export const resetSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp.',
    path: ['confirmPassword'],
  })
export function authError(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? 'Kiểm tra lại thông tin.'
  const code = (error as { code?: string })?.code
  const messages: Record<string, string> = {
    invalid_credentials: 'Email hoặc mật khẩu không đúng.',
    email_not_confirmed: 'Hãy xác minh email trước khi đăng nhập.',
    over_email_send_rate_limit: 'Bạn đã gửi quá nhiều email. Hãy thử lại sau.',
    over_request_rate_limit: 'Quá nhiều yêu cầu. Hãy thử lại sau.',
    weak_password: 'Mật khẩu chưa đáp ứng chính sách bảo mật của hệ thống.',
    same_password: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
    otp_expired: 'Liên kết đã hết hạn. Hãy yêu cầu gửi lại.',
    user_already_exists:
      'Không thể đăng ký với thông tin này. Hãy đăng nhập hoặc khôi phục mật khẩu.',
  }
  return (
    (code && messages[code]) ||
    'Không thực hiện được yêu cầu. Kiểm tra kết nối và thử lại.'
  )
}
