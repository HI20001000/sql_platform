import './assets/main.css'

import { createApp } from 'vue'
import { apiBaseUrl } from './scripts/apiBaseUrl.js'
import App from './App.vue'
import router from './router'


const readAuthStorage = () => {
  const raw = window.localStorage.getItem('innerai_auth')
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (!data?.token || !data?.expiresAt) return null
    return data
  } catch {
    return null
  }
}

const clearAuthStorage = () => {
  window.localStorage.removeItem('innerai_auth')
  window.localStorage.removeItem('innerai_user')
}

const getNavigationType = () => {
  const entry = performance.getEntriesByType('navigation')[0]
  if (entry?.type) return entry.type
  const legacyType = performance?.navigation?.type
  switch (legacyType) {
    case 1:
      return 'reload'
    case 2:
      return 'back_forward'
    default:
      return 'navigate'
  }
}

const sendNavigationEvent = async (payload) => {
  try {
    const auth = readAuthStorage()
    const userRaw = window.localStorage.getItem('innerai_user')
    const user = userRaw ? JSON.parse(userRaw) : null
    await fetch(`${apiBaseUrl}/api/telemetry/navigation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      body: JSON.stringify({
        ...payload,
        user: user?.mail ? { mail: user.mail, username: user.username } : null,
      }),
      keepalive: true,
    })
  } catch {
    // ignore telemetry failures
  }
}

const verifyAuth = async () => {
  const auth = readAuthStorage()
  if (!auth) return false
  if (Date.now() >= Date.parse(auth.expiresAt)) {
    clearAuthStorage()
    return false
  }
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await response.json()
    if (!response.ok) {
      clearAuthStorage()
      return false
    }
    if (data?.user) {
      window.localStorage.setItem('innerai_user', JSON.stringify(data.user))
    }
    if (data?.expiresAt) {
      window.localStorage.setItem(
        'innerai_auth',
        JSON.stringify({ token: auth.token, expiresAt: data.expiresAt })
      )
    }
    return true
  } catch {
    clearAuthStorage()
    return false
  }
}

const ensureRouteAccess = (authed) => {
  const currentPath = window.location.pathname
  const normalized = currentPath === '/login' ? '/' : currentPath
  if (!authed && normalized !== '/') {
    router.push('/')
  }
  if (authed && normalized === '/') {
    router.push('/home')
  }
}

const bootstrap = async () => {
  const app = createApp(App).use(router)
  const authed = await verifyAuth()
  ensureRouteAccess(authed)
  await sendNavigationEvent({
    event: 'initial-load',
    navigationType: getNavigationType(),
    route: window.location.pathname,
  })
  window.addEventListener('innerai:navigation', (event) => {
    const detail = event.detail || {}
    sendNavigationEvent({
      event: 'route-change',
      navigationType: 'spa',
      route: detail.to,
      from: detail.from,
      to: detail.to,
      trigger: detail.trigger,
    })
  })
  app.mount('#app')
}

bootstrap()
