<script setup lang="ts">
import { computed, useId } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import {
  PaginationRoot,
  PaginationList,
  PaginationListItem,
  PaginationPrev,
  PaginationNext,
  PaginationEllipsis,
} from 'reka-ui'
import { ChevronLeft, ChevronRight, Ellipsis } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from '@/components/ui/select'
const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    disabled?: boolean
    compact?: boolean
    label?: string
    showSize?: boolean
  }>(),
  { label: 'Phân trang', showSize: true },
)
const emit = defineEmits<{ change: [page: number, pageSize: number] }>()
const id = useId()
const smallScreen = useMediaQuery('(max-width: 639px)')
const pages = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize)),
)
</script>
<template>
  <footer
    class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm"
  >
    <p class="text-muted-foreground" aria-live="polite">
      {{ total ? (page - 1) * pageSize + 1 : 0 }}–{{
        Math.min(page * pageSize, total)
      }}
      / {{ total }}
    </p>
    <div v-if="showSize && total > 0" class="flex items-center gap-2">
      <label :for="id">Mỗi trang</label>
      <Select
        :model-value="String(pageSize)"
        :disabled="disabled"
        @update:model-value="emit('change', 1, Number($event))"
      >
        <SelectTrigger :id="id" class="w-20"><SelectValue /></SelectTrigger>
        <SelectContent
          ><SelectItem
            v-for="size in [10, 20, 50]"
            :key="size"
            :value="String(size)"
            >{{ size }}</SelectItem
          ></SelectContent
        >
      </Select>
    </div>
    <PaginationRoot
      v-if="pages > 1"
      :page="page"
      :items-per-page="pageSize"
      :total="total"
      :sibling-count="1"
      :disabled="disabled"
      show-edges
      :aria-label="label"
      @update:page="emit('change', $event, pageSize)"
    >
      <PaginationList
        v-slot="{ items }"
        class="flex flex-wrap items-center gap-1"
      >
        <PaginationPrev as-child
          ><Button
            variant="outline"
            size="icon"
            aria-label="Trang trước"
            title="Trang trước"
            ><ChevronLeft aria-hidden="true" /></Button
        ></PaginationPrev>
        <span
          v-if="compact || smallScreen"
          class="px-2"
          :aria-label="`Trang ${page} trên ${pages}`"
          >{{ page }}/{{ pages }}</span
        >
        <template v-else v-for="(item, index) in items" :key="index">
          <PaginationListItem
            v-if="item.type === 'page'"
            :value="item.value"
            as-child
          >
            <Button
              :variant="item.value === page ? 'default' : 'outline'"
              size="icon"
              :aria-label="`Trang ${item.value}`"
              :aria-current="item.value === page ? 'page' : undefined"
              >{{ item.value }}</Button
            >
          </PaginationListItem>
          <PaginationEllipsis v-else :index="index" class="px-1"
            ><Ellipsis :size="16" aria-hidden="true" /><span class="sr-only"
              >Các trang khác</span
            ></PaginationEllipsis
          >
        </template>
        <PaginationNext as-child
          ><Button
            variant="outline"
            size="icon"
            aria-label="Trang sau"
            title="Trang sau"
            ><ChevronRight aria-hidden="true" /></Button
        ></PaginationNext>
      </PaginationList>
    </PaginationRoot>
  </footer>
</template>
