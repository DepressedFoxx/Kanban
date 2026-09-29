<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import {
  Columns3,
  LayoutDashboard,
  BookOpen,
  ArrowUpRight,
  Sprout,
} from '@lucide/vue'
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink
        to="/board"
        class="flex items-center gap-3 text-lg font-semibold"
        ><span
          class="flex size-9 items-center justify-center rounded-xl bg-primary text-white"
          ><Columns3 :size="19" /></span
        >kanban<span class="text-primary">.</span></RouterLink
      >
      <div
        class="mt-9 hidden rounded-xl border border-border bg-white p-3 lg:block"
      >
        <p class="text-xs text-muted-foreground">Không gian làm việc</p>
        <p class="mt-2 flex items-center gap-2 text-sm font-medium">
          <span class="avatar">S</span>Studio nhỏ
        </p>
      </div>
      <nav class="mt-7 flex gap-2 lg:flex-col" aria-label="Điều hướng chính">
        <RouterLink to="/board" class="nav-link"
          ><LayoutDashboard :size="17" />Bảng công việc</RouterLink
        ><RouterLink to="/guide" class="nav-link"
          ><BookOpen :size="17" />Hướng dẫn</RouterLink
        >
      </nav>
      <div class="mt-auto hidden pt-12 lg:block">
        <div class="rounded-xl bg-[#e9eee6] p-4">
          <Sprout :size="22" class="text-primary" />
          <p class="mt-3 text-sm font-medium">Từng bước, cùng nhau.</p>
          <p class="mt-2 text-xs leading-5 text-muted-foreground">
            Bắt đầu nhỏ. Giữ tập trung. Hoàn thành điều quan trọng.
          </p>
          <RouterLink
            to="/guide"
            class="mt-4 flex items-center gap-2 text-xs font-medium text-primary"
            >Khám phá cách dùng<ArrowUpRight :size="14"
          /></RouterLink>
        </div>
        <p class="mt-5 text-[11px] text-muted-foreground">
          Không gian mẫu · Phiên bản 0.1
        </p>
      </div>
    </aside>
    <div class="min-w-0">
      <header
        class="flex min-h-17 items-center justify-between gap-4 border-b border-border bg-white px-5 lg:px-9"
      >
        <p class="text-xs text-muted-foreground">
          Studio nhỏ <span class="mx-2 text-stone-300">/</span> Không gian làm
          việc
        </p>
        <span
          class="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground"
          ><span class="size-1.5 rounded-full bg-emerald-600" />Bản local</span
        >
      </header>
      <RouterView />
    </div>
  </div>
</template>
