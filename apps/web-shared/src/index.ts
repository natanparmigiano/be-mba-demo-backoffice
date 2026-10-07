export { apiClient } from './api'
export { authClient, type AuthSession, type AuthUser } from './auth/auth-client'
export { AuthProvider, useAuth } from './auth/AuthProvider'
export { hasAdminRole } from './auth/roles'
export { LanguageSwitcher } from './components/LanguageSwitcher'
export { AppShell } from './components/app/AppShell'
export { OrganizationGuard } from './components/app/OrganizationGuard'
export { OrganizationLogo } from './components/app/OrganizationLogo'
export { OrganizationLogoPicker } from './components/app/OrganizationLogoPicker'
export { OrganizationSwitcher } from './components/app/OrganizationSwitcher'
export {
  removeOrganizationLogo,
  uploadOrganizationLogo,
} from './components/app/organization-logo-api'
export { ThemeSwitcher } from './components/theme/ThemeSwitcher'
export { AdminPage } from './pages/AdminPage'
export { LoginPage } from './pages/LoginPage'
export { OrganizationPage } from './pages/OrganizationPage'
export {
  AdminRoute,
  AuthSessionRoute,
  GuestRoute,
  PrivateRoute,
  PublicRoute,
  type AuthRedirectState,
} from './router/RouteGuards'
