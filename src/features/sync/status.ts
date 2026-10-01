export type SyncInput = {
  online: boolean
  pending: boolean
  uncertain: boolean
  loading: boolean
  refreshing: boolean
  error: string
  syncError: string
  lastSyncedAt: string
}
export function syncStatus(value: SyncInput) {
  if (value.pending) return { kind: 'saving', label: 'Đang lưu…' }
  if (value.uncertain)
    return {
      kind: 'uncertain',
      label:
        'Chưa xác nhận được lần lưu. Kết nối mạng rồi xác nhận lại thao tác.',
    }
  if (!value.online)
    return {
      kind: 'offline',
      label: 'Đang offline — thay đổi chưa gửi sẽ không tự lưu.',
    }
  if (value.error)
    return {
      kind: 'error',
      label: 'Lần thao tác gần nhất chưa hoàn tất. Xem thông báo lỗi để xử lý.',
    }
  if (value.syncError) return { kind: 'stale', label: value.syncError }
  if (value.loading) return { kind: 'loading', label: 'Đang tải dữ liệu…' }
  if (value.refreshing)
    return { kind: 'refreshing', label: 'Đang kiểm tra cập nhật…' }
  if (!value.lastSyncedAt)
    return { kind: 'idle', label: 'Chưa tải được dữ liệu từ máy chủ.' }
  return { kind: 'synced', label: 'Đã đồng bộ với máy chủ.' }
}
