import {
  Building2,
  ChevronDown,
  Home,
  LogOut,
  RadioTower,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import signifierUrl from '../../assets/signifier.png'
import { authClient } from '../../auth/auth-client'
import { useAuth } from '../../auth/AuthProvider'
import { hasAdminRole } from '../../auth/roles'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import {
  Avatar,
  Button,
  cn,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '../ui'
import { OrganizationGuard } from './OrganizationGuard'
import { OrganizationSwitcher } from './OrganizationSwitcher'

export function AppShell() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { session, user, refetch } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const signOut = async () => {
    setIsSigningOut(true)
    try {
      await authClient.signOut()
      await refetch()
      void navigate('/login', { replace: true })
    } finally {
      setIsSigningOut(false)
    }
  }

  const navigation = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/channels', label: 'Channels', icon: RadioTower, end: false },
  ]
  const workspaceNavigation = [
    {
      to: '/organization',
      label: 'Manage organizations',
      icon: Building2,
    },
    ...(hasAdminRole(user?.role)
      ? [{ to: '/admin', label: 'Administration', icon: ShieldCheck }]
      : []),
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card p-4 md:flex">
        <div className="flex items-center gap-3 px-2 py-1">
          <img className="size-9 rounded-xl" src={signifierUrl} alt="" />
          <div>
            <p className="text-sm font-bold">MBA Demo</p>
            <p className="text-xs text-muted-foreground">Backoffice</p>
          </div>
        </div>
        <nav className="mt-8 grid gap-1">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border bg-card p-2 shadow-xs">
          <OrganizationSwitcher />
          <div className="my-2 h-px bg-border" />
          <nav className="grid gap-1">
            {workspaceNavigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-primary/12 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <header className="fixed top-0 right-0 left-0 z-20 border-b bg-topbar/95 px-4 py-3 backdrop-blur-xl md:left-64">
        <div className="flex items-center justify-end gap-2">
          {session?.session.impersonatedBy && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void authClient.admin.stopImpersonating().then(() => refetch())
              }
            >
              Stop impersonating
            </Button>
          )}
          <LanguageSwitcher />
          <ThemeSwitcher />
          <Menu>
            <MenuTrigger
              className="group flex max-w-64 items-center gap-2 rounded-full py-0.5 pl-3 text-left"
              aria-label={user?.name ?? user?.email ?? 'User'}
            >
              <span className="hidden min-w-0 text-right sm:block">
                <span className="block truncate text-sm font-bold">
                  {user?.name}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {user?.email}
                </span>
              </span>
              <Avatar name={user?.name ?? user?.email ?? 'User'} size="md" />
              <span className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
                <ChevronDown
                  className="size-3.5 transition-transform group-aria-expanded:rotate-180"
                  aria-hidden
                />
              </span>
            </MenuTrigger>
            <MenuContent className="w-60">
              <div role="presentation" className="min-w-0 px-3 py-2">
                <p className="truncate text-sm font-bold">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email}
                </p>
              </div>
              <MenuSeparator />
              <MenuItem
                variant="danger"
                disabled={isSigningOut}
                onClick={() => void signOut()}
              >
                <LogOut className="size-4" aria-hidden />
                {t('auth.signOut')}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <main className="min-h-screen pt-16 md:pl-64">
        <div className="mx-auto max-w-7xl p-5 sm:p-8">
          <OrganizationGuard>
            <Outlet />
          </OrganizationGuard>
        </div>
      </main>
    </div>
  )
}
