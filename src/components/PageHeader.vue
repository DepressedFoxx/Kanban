<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>
<template>
  <header class="page-heading">
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="mt-2 text-sm text-muted-foreground">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.default" class="page-heading-actions"><slot /></div>
  </header>
</template>
