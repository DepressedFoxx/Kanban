<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
withDefaults(defineProps<{ label?: string; busy?: boolean }>(), {
  label: 'Tải lại',
})
</script>
<template>
  <Button
    variant="outline"
    size="icon"
    class="shrink-0"
    :aria-label="label"
    :title="label"
    :aria-busy="busy || undefined"
    ><RefreshCw aria-hidden="true"
  /></Button>
</template>
