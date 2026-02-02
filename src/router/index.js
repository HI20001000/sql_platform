import { h, shallowRef } from 'vue'
import LoginView from '../views/Login.vue'
import HomeView from '../views/Home.vue'
import TaskCreateView from '../views/TaskCreate.vue'
import TaskSubmissionsView from '../views/TaskSubmissions.vue'
import MeetingUploadView from '../views/MeetingUpload.vue'
import MeetingRecordsView from '../views/MeetingRecords.vue'
import NotFoundView from '../views/NotFound.vue'
import ProfileSettingsView from '../views/ProfileSettings.vue'
import UserDashboardView from '../views/UserDashboard.vue'

const routeRecords = [
  { path: '/', name: 'login', component: LoginView },
  { path: '/home', name: 'home', component: HomeView },
  { path: '/tasks/new', name: 'task-create', component: TaskCreateView },
  { path: '/tasks/view', name: 'task-view', component: TaskSubmissionsView },
  { path: '/meetings/upload', name: 'meeting-upload', component: MeetingUploadView },
  { path: '/meetings', name: 'meeting-records', component: MeetingRecordsView },
  { path: '/users/dashboard', name: 'user-dashboard', component: UserDashboardView },
  { path: '/settings', name: 'settings', component: ProfileSettingsView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
]
const routes = new Map(routeRecords.map((route) => [route.path, route.component]))
const normalizePath = (path) => (path === '/login' ? '/' : path)
const getAuthState = () => {
  const raw = window.localStorage.getItem('innerai_auth')
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (!data?.token || !data?.expiresAt) return null
    if (Date.now() >= Date.parse(data.expiresAt)) {
      window.localStorage.removeItem('innerai_auth')
      return null
    }
    return data
  } catch {
    window.localStorage.removeItem('innerai_auth')
    return null
  }
}

const enforceAuth = (path) => {
  const authed = Boolean(getAuthState())
  if (!authed && path !== '/') return '/'
  if (authed && path === '/') return '/home'
  return path
}

const currentPath = shallowRef(
  enforceAuth(normalizePath(window.location.pathname || '/'))
)
const resolveRoute = (path) => {
  const record = routeRecords.find((route) => route.path === path)
  const matchedRecord = record || routeRecords.find((route) => route.name === 'not-found')
  return {
    path,
    matched: matchedRecord ? [matchedRecord] : [],
  }
}

const currentRoute = shallowRef(resolveRoute(currentPath.value))

const emitNavigation = (from, to, trigger) => {
  window.dispatchEvent(
    new CustomEvent('innerai:navigation', {
      detail: {
        from,
        to,
        trigger,
      },
    })
  )
}

const updatePath = (path, trigger = 'unknown') => {
  const nextPath = enforceAuth(normalizePath(path))
  if (nextPath === currentPath.value) return
  const previousPath = currentPath.value
  currentPath.value = nextPath
  currentRoute.value = resolveRoute(nextPath)
  emitNavigation(previousPath, nextPath, trigger)
}

window.addEventListener('popstate', () => {
  updatePath(window.location.pathname || '/', 'popstate')
})

const RouterView = {
  name: 'RouterView',
  setup() {
    return () => {
      const component = routes.get(currentPath.value) || routes.get('/:pathMatch(.*)*')
      return component ? h(component) : null
    }
  },
}

const router = {
  currentRoute,
  options: {
    history: {
      base: '/',
      location: currentPath,
      state: {},
    },
    routes: routeRecords,
  },
  install(app) {
    app.component('RouterView', RouterView)
    app.config.globalProperties.$router = router
    app.config.globalProperties.$route = currentRoute
  },
  getRoutes() {
    return routeRecords.map((route) => ({ ...route }))
  },
  push(path) {
    const nextPath = enforceAuth(normalizePath(path))
    if (nextPath === currentPath.value) return
    window.history.pushState({}, '', nextPath)
    updatePath(nextPath, 'push')
  },
}

export default router
