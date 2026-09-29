<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'outline' | 'ghost'
    class?: HTMLAttributes['class']
    type?: 'button' | 'submit' | 'reset'
  }>(),
  { variant: 'primary', type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :class="
      cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        {
          'bg-primary text-primary-foreground hover:bg-primary/90':
            variant === 'primary',
          'border border-border bg-white hover:bg-muted': variant === 'outline',
          'hover:bg-muted text-foreground': variant === 'ghost',
        },
        props.class,
      )
    "
  >
    <slot />
  </button>
</template>
