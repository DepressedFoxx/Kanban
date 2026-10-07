import { appConfig } from './app'

const titles: Record<string, string> = {
  '/guide': 'Hướng dẫn sử dụng',
  '/notifications': 'Thông báo',
  '/my-tasks': 'Công việc của tôi',
  '/workspaces': 'Workspace & board',
  '/account': 'Tài khoản',
  '/login': 'Đăng nhập',
  '/register': 'Đăng ký',
  '/forgot-password': 'Quên mật khẩu',
  '/reset-password': 'Đặt lại mật khẩu',
  '/auth/callback': 'Xác thực tài khoản',
  '/personal-board': 'Board cá nhân',
}

export function pageTitle(path: string, boardName?: string) {
  const title =
    titles[path] ??
    (path.startsWith('/boards/')
      ? boardName || 'Bảng công việc'
      : path.endsWith('/settings')
        ? 'Cài đặt workspace'
        : path.endsWith('/members')
          ? 'Thành viên'
          : path.endsWith('/boards')
            ? 'Danh sách board'
            : path.startsWith('/invite/')
              ? 'Lời mời workspace'
              : 'Workspace')
  return `${title} · ${appConfig.name}`
}
