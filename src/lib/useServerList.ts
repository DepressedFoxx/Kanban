import { onScopeDispose, ref, type Ref } from 'vue'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { withDeadline } from '@/features/sync/request'

export function useServerList<T>(
  source: string,
  schema: z.ZodType<T>,
  workspace?: string,
) {
  const items = ref<T[]>([]) as Ref<T[]>
  const page = ref(1),
    pageSize = ref(20),
    total = ref(0),
    loading = ref(false),
    error = ref('')
  const filters = ref<Record<string, unknown>>({})
  let generation = 0
  onScopeDispose(() => {
    generation++
  })
  async function load(nextPage = page.value, nextSize = pageSize.value) {
    const request = ++generation
    loading.value = true
    error.value = ''
    try {
      if (!supabase) throw Error('Unavailable')
      const { data, error: cause } = await withDeadline((signal) =>
        supabase!
          .rpc('app_list_query', {
            p_source: source,
            p_workspace: workspace ?? null,
            p_page: nextPage,
            p_page_size: nextSize,
            p_filters: filters.value,
          })
          .abortSignal(signal),
      )
      if (cause) throw cause
      const parsed = z
        .object({
          items: schema.array(),
          page: z.number().int().positive(),
          pageSize: z.number().int().min(1).max(50),
          total: z.number().int().nonnegative(),
        })
        .parse(data)
      if (request !== generation) return
      items.value = parsed.items
      page.value = parsed.page
      pageSize.value = parsed.pageSize
      total.value = parsed.total
    } catch {
      if (request === generation) {
        items.value = []
        total.value = 0
        error.value =
          'Không tải được danh sách. Kiểm tra kết nối rồi thử tải lại.'
      }
    } finally {
      if (request === generation) loading.value = false
    }
  }
  return { items, page, pageSize, total, filters, loading, error, load }
}
