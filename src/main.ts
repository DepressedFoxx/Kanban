import { appConfig } from './config/app'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router, installAuthGuards } from './router'
import './assets/main.css'

document.title = appConfig.name
document.documentElement.lang = appConfig.locale

const pinia = createPinia()
const stopAuthWatch = installAuthGuards(pinia)
const app = createApp(App).use(pinia).use(router)
void router.isReady().then(() => app.mount('#app'))
if (import.meta.hot) import.meta.hot.dispose(stopAuthWatch)
