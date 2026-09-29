<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { authConfigurationError } from '@/lib/supabase'
const auth = useAuthStore()
</script>
<template>
  <p
    v-if="!auth.configured"
    role="status"
    class="rounded-lg border border-border bg-muted p-3 text-sm leading-6"
  >
    {{ authConfigurationError }}
  </p>
  <p
    v-if="auth.initializationError"
    role="alert"
    class="text-sm text-destructive"
  >
    Không phục hồi được phiên. {{ auth.initializationError }} Bạn có thể đăng
    nhập lại.
  </p>
  <p
    v-if="auth.error"
    role="alert"
    class="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
  >
    {{ auth.error }}
  </p>
  <p
    v-if="auth.notice"
    role="status"
    class="rounded-lg bg-secondary p-3 text-sm text-secondary-foreground"
  >
    {{ auth.notice }}
  </p>
</template>
