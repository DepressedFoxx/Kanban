export const productivityConfig = {
  labelsPerWorkspace: 100,
  labelsPerTask: 20,
  labelName: 40,
  checklistItems: 100,
  checklistBody: 300,
  bulkTasks: 50,
  moderationReason: 500,
} as const
export const labelColors = {
  blue: 'Xanh dương',
  green: 'Xanh lá',
  amber: 'Vàng',
  red: 'Đỏ',
  purple: 'Tím',
  slate: 'Xám',
} as const
export const labelClasses: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-900',
  green: 'bg-green-100 text-green-900',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-900',
  purple: 'bg-purple-100 text-purple-900',
  slate: 'bg-slate-100 text-slate-900',
}
