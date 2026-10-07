import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { authClient, type AuthSession, type AuthUser } from './auth-client'

interface AuthContextValue {
  session: AuthSession | null
  user: AuthUser | null
  isPending: boolean
  isRefetching: boolean
  error: Error | null
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending, isRefetching, error, refetch } =
    authClient.useSession()

  const value = useMemo<AuthContextValue>(
    () => ({
      session: data ?? null,
      user: data?.user ?? null,
      isPending,
      isRefetching,
      error,
      refetch: () => refetch(),
    }),
    [data, error, isPending, isRefetching, refetch],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
