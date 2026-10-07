import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { hasAdminRole } from '../auth/roles'

export interface AuthRedirectState {
  from?: {
    pathname: string
    search: string
    hash: string
  }
}

export function PublicRoute() {
  return <Outlet />
}

export function AuthSessionRoute() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

export function PrivateRoute() {
  const location = useLocation()
  const { session, isPending } = useAuth()

  if (isPending) return <SessionLoading />
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={
          {
            from: {
              pathname: location.pathname,
              search: location.search,
              hash: location.hash,
            },
          } satisfies AuthRedirectState
        }
      />
    )
  }

  return <Outlet />
}

export function GuestRoute() {
  const { session, isPending } = useAuth()

  if (isPending) return <SessionLoading />
  if (session) return <Navigate to="/" replace />

  return <Outlet />
}

export function AdminRoute() {
  const { user } = useAuth()
  return hasAdminRole(user?.role) ? <Outlet /> : <Navigate to="/" replace />
}

function SessionLoading() {
  const { t } = useTranslation()

  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground">
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-5 animate-spin text-primary" />
        {t('auth.checkingSession')}
      </div>
    </main>
  )
}
