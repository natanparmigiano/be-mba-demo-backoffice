import {
  ArrowRight,
  Building2,
  CircleAlert,
  LockKeyhole,
  Mail,
} from 'lucide-react'
import { useEffect, useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import signifierDarkUrl from '../assets/signifier-mono-dark.svg'
import signifierLightUrl from '../assets/signifier-mono-light.svg'
import { authClient } from '../auth/auth-client'
import { useAuth } from '../auth/AuthProvider'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { ThemeSwitcher } from '../components/theme/ThemeSwitcher'
import { Button, Checkbox, Input } from '../components/ui'
import type { AuthRedirectState } from '../router/RouteGuards'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { refetch } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [ssoEmail, setSsoEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    document.title = `${t('auth.loginTitle')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('auth.metaDescription'))
  }, [t])

  const signIn = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim() || !password) return

    setError(null)
    setIsSubmitting(true)

    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
        rememberMe,
      })

      if (result.error) {
        setError(t('auth.invalidCredentials'))
        return
      }

      await refetch()
      void navigate(getRedirectPath(location.state), { replace: true })
    } catch {
      setError(t('auth.unexpectedError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const signInWithSso = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ssoEmail.trim()) return

    setError(null)
    setIsSubmitting(true)
    try {
      const callbackPath = getRedirectPath(location.state)
      const result = await authClient.signIn.sso({
        email: ssoEmail.trim(),
        callbackURL: `${window.location.origin}${callbackPath}`,
        errorCallbackURL: `${window.location.origin}/login`,
      })
      if (result.error) {
        setError(result.error.message ?? t('auth.unexpectedError'))
      }
    } catch {
      setError(t('auth.unexpectedError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-20 text-foreground sm:px-6">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl shadow-foreground/8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-brand-gradient hidden p-10 text-center text-white lg:flex lg:flex-col lg:items-center lg:justify-center">
          <img
            className="size-24"
            src={signifierLightUrl}
            alt={t('design.brand')}
          />
          <h1 className="mt-8 text-3xl font-extrabold tracking-[-0.035em]">
            {t('auth.heroTitle')}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/75">
            {t('auth.heroDescription')}
          </p>
        </div>

        <div className="p-6 sm:p-10 lg:p-14">
          <div className="lg:hidden">
            <img
              className="size-10 dark:hidden"
              src={signifierDarkUrl}
              alt={t('design.brand')}
            />
            <img
              className="hidden size-10 dark:block"
              src={signifierLightUrl}
              alt={t('design.brand')}
            />
          </div>

          <div className="mt-8 lg:mt-0">
            <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
              {t('auth.loginEyebrow')}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em]">
              {t('auth.loginTitle')}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t('auth.loginDescription')}
            </p>
          </div>

          <form
            className="mt-8 grid gap-5"
            onSubmit={(event) => void signIn(event)}
          >
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              leadingIcon={Mail}
              autoComplete="email"
              autoFocus
              required
            />
            <Input
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              leadingIcon={LockKeyhole}
              autoComplete="current-password"
              required
            />

            <Checkbox
              label={t('auth.rememberMe')}
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />

            {error && (
              <div
                className="flex items-start gap-2.5 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" isLoading={isSubmitting}>
              {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
              {!isSubmitting && <ArrowRight className="size-4" />}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use company SSO
            <span className="h-px flex-1 bg-border" />
          </div>

          <form
            className="grid gap-3"
            onSubmit={(event) => void signInWithSso(event)}
          >
            <Input
              label="Work email"
              type="email"
              value={ssoEmail}
              onChange={(event) => setSsoEmail(event.target.value)}
              placeholder="you@company.com"
              leadingIcon={Building2}
              autoComplete="email"
              required
            />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              isLoading={isSubmitting}
            >
              Continue with SSO
            </Button>
          </form>

          <div className="mt-8 border-t pt-6 text-center">
            <Link
              className="text-sm font-semibold text-primary hover:underline"
              to="/design-system"
            >
              {t('auth.viewDesignSystem')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

function getRedirectPath(state: unknown) {
  const redirect = (state as AuthRedirectState | null)?.from
  if (
    !redirect ||
    !redirect.pathname.startsWith('/') ||
    redirect.pathname.startsWith('//')
  ) {
    return '/'
  }
  return `${redirect.pathname}${redirect.search}${redirect.hash}`
}
