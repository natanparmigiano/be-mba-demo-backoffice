import type { InferResponseType } from 'hono/client'
import { Clipboard, KeyRound, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { Button, Checkbox, Input, Pill } from '../components/ui'

type ApiKeysResponse = InferResponseType<
  (typeof apiClient.api.runner)['api-keys']['$get'],
  200
>
type ApiKeyMetadata = ApiKeysResponse['apiKeys'][number]
type FunctionsResponse = InferResponseType<
  typeof apiClient.api.runner.functions.$get,
  200
>
type FunctionSummary = FunctionsResponse['functions'][number]
type McpsResponse = InferResponseType<
  typeof apiClient.api.runner.mcps.$get,
  200
>
type McpSummary = McpsResponse['mcps'][number]

export function ApiKeysPage() {
  const { t, i18n } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [apiKeys, setApiKeys] = useState<ApiKeyMetadata[]>([])
  const [functions, setFunctions] = useState<FunctionSummary[]>([])
  const [mcps, setMcps] = useState<McpSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyName, setKeyName] = useState('')
  const [keyExpiresAt, setKeyExpiresAt] = useState(defaultExpirationValue)
  const [allResources, setAllResources] = useState(true)
  const [allowedFunctionIds, setAllowedFunctionIds] = useState<number[]>([])
  const [allowedMcpIds, setAllowedMcpIds] = useState<number[]>([])
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [revokingKeyId, setRevokingKeyId] = useState<number | null>(null)

  useEffect(() => {
    document.title = `${t('apiKeys.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('apiKeys.metaDescription'))
  }, [t])

  const refresh = useCallback(async () => {
    if (!activeOrganizationId || !canManage) {
      setApiKeys([])
      setFunctions([])
      setMcps([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const [keysResponse, functionsResponse, mcpsResponse] = await Promise.all(
        [
          apiClient.api.runner['api-keys'].$get(),
          apiClient.api.runner.functions.$get(),
          apiClient.api.runner.mcps.$get(),
        ],
      )
      if (!keysResponse.ok || !functionsResponse.ok || !mcpsResponse.ok) {
        throw new Error(t('apiKeys.loadFailed'))
      }
      setApiKeys((await keysResponse.json()).apiKeys)
      setFunctions((await functionsResponse.json()).functions)
      setMcps((await mcpsResponse.json()).mcps)
    } catch (reason) {
      setError(getErrorMessage(reason, t('apiKeys.loadFailed')))
    } finally {
      setIsLoading(false)
    }
  }, [activeOrganizationId, canManage, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createApiKey = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setError(null)
    try {
      const response = await apiClient.api.runner['api-keys'].$post({
        json: {
          name: keyName.trim(),
          expiresAt: new Date(keyExpiresAt).toISOString(),
          allowedFunctionIds: allResources ? null : allowedFunctionIds,
          allowedMcpIds: allResources ? null : allowedMcpIds,
        },
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('apiKeys.createFailed')))
      }
      const created = (await response.json()).apiKey
      setCreatedApiKey(created.apiKey)
      setKeyName('')
      setKeyExpiresAt(defaultExpirationValue())
      setAllResources(true)
      setAllowedFunctionIds([])
      setAllowedMcpIds([])
      await refresh()
    } catch (reason) {
      setError(getErrorMessage(reason, t('apiKeys.createFailed')))
    } finally {
      setIsCreating(false)
    }
  }

  const revokeApiKey = async (apiKeyId: number) => {
    setRevokingKeyId(apiKeyId)
    setError(null)
    try {
      const response = await apiClient.api.runner['api-keys'][
        ':apiKeyId'
      ].$delete({ param: { apiKeyId: String(apiKeyId) } })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('apiKeys.revokeFailed')))
      }
      await refresh()
    } catch (reason) {
      setError(getErrorMessage(reason, t('apiKeys.revokeFailed')))
    } finally {
      setRevokingKeyId(null)
    }
  }

  const toggleFunction = (functionId: number, checked: boolean) => {
    setAllowedFunctionIds((current) =>
      checked
        ? [...current, functionId]
        : current.filter((id) => id !== functionId),
    )
  }

  const toggleMcp = (mcpId: number, checked: boolean) => {
    setAllowedMcpIds((current) =>
      checked ? [...current, mcpId] : current.filter((id) => id !== mcpId),
    )
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('apiKeys.eyebrow')}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            {t('apiKeys.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t('apiKeys.description')}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={isLoading}
          onClick={() => void refresh()}
        >
          <RefreshCw className="size-4" />
          {t('apiKeys.refresh')}
        </Button>
      </header>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!canManage ? (
        <section className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          {t('apiKeys.managersOnly')}
        </section>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-bold">{t('apiKeys.createTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('apiKeys.createDescription')}
            </p>
            <form
              className="mt-4 grid gap-4"
              onSubmit={(event) => void createApiKey(event)}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label={t('apiKeys.keyName')}
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
                  required
                  disabled={isCreating}
                />
                <Input
                  label={t('apiKeys.expiresAt')}
                  type="datetime-local"
                  value={keyExpiresAt}
                  min={minimumExpirationValue()}
                  onChange={(event) => setKeyExpiresAt(event.target.value)}
                  required
                  disabled={isCreating}
                />
              </div>
              <div className="rounded-lg border p-3">
                <Checkbox
                  label={t('apiKeys.allResources')}
                  checked={allResources}
                  disabled={isCreating}
                  onChange={(event) => setAllResources(event.target.checked)}
                />
                {!allResources && (
                  <div className="mt-3 grid gap-4 border-t pt-3 md:grid-cols-2">
                    <fieldset>
                      <legend className="text-sm font-semibold">
                        {t('apiKeys.mcpPacks')}
                      </legend>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('apiKeys.mcpPacksHint')}
                      </p>
                      <div className="mt-3 grid gap-2">
                        {mcps.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {t('apiKeys.noMcps')}
                          </p>
                        ) : (
                          mcps.map((item) => (
                            <Checkbox
                              key={item.id}
                              label={item.name}
                              checked={allowedMcpIds.includes(item.id)}
                              disabled={isCreating}
                              onChange={(event) =>
                                toggleMcp(item.id, event.target.checked)
                              }
                            />
                          ))
                        )}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend className="text-sm font-semibold">
                        {t('apiKeys.individualFunctions')}
                      </legend>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('apiKeys.individualFunctionsHint')}
                      </p>
                      <div className="mt-3 grid gap-2">
                        {functions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {t('apiKeys.noFunctions')}
                          </p>
                        ) : (
                          functions.map((item) => (
                            <Checkbox
                              key={item.id}
                              label={item.name}
                              checked={allowedFunctionIds.includes(item.id)}
                              disabled={isCreating}
                              onChange={(event) =>
                                toggleFunction(item.id, event.target.checked)
                              }
                            />
                          ))
                        )}
                      </div>
                    </fieldset>
                  </div>
                )}
              </div>
              <div>
                <Button type="submit" isLoading={isCreating}>
                  <KeyRound className="size-4" />
                  {t('apiKeys.create')}
                </Button>
              </div>
            </form>
            {createdApiKey && (
              <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <p className="text-sm font-semibold">{t('apiKeys.copyNow')}</p>
                <div className="mt-2 flex gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded bg-card px-3 py-2 text-xs">
                    {createdApiKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={t('apiKeys.copy')}
                    onClick={() =>
                      void navigator.clipboard.writeText(createdApiKey)
                    }
                  >
                    <Clipboard className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-bold">{t('apiKeys.existing')}</h2>
            <div className="mt-4 grid gap-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">
                  {t('apiKeys.loading')}
                </p>
              ) : apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('apiKeys.empty')}
                </p>
              ) : (
                apiKeys.map((key) => {
                  const status = getKeyStatus(key)
                  return (
                    <div
                      key={key.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3"
                    >
                      <KeyRound className="size-4 text-muted-foreground" />
                      <div className="min-w-48 flex-1">
                        <p className="text-sm font-semibold">{key.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {key.keyPrefix}… ·{' '}
                          {formatScope(key, functions, mcps, t)} ·{' '}
                          {t('apiKeys.expires', {
                            date: formatDate(key.expiresAt, i18n.language),
                          })}
                        </p>
                      </div>
                      <Pill
                        tone={
                          status === 'active'
                            ? 'success'
                            : status === 'expired'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {t(`apiKeys.status.${status}`)}
                      </Pill>
                      {status === 'active' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={revokingKeyId === key.id}
                          onClick={() => void revokeApiKey(key.id)}
                        >
                          {t('apiKeys.revoke')}
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function defaultExpirationValue(): string {
  return toLocalDateTimeValue(new Date(Date.now() + 30 * 24 * 60 * 60_000))
}

function minimumExpirationValue(): string {
  return toLocalDateTimeValue(new Date(Date.now() + 60_000))
}

function toLocalDateTimeValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getKeyStatus(key: ApiKeyMetadata): 'active' | 'expired' | 'revoked' {
  if (key.revokedAt) return 'revoked'
  return new Date(key.expiresAt).getTime() <= Date.now() ? 'expired' : 'active'
}

function formatScope(
  key: ApiKeyMetadata,
  functions: FunctionSummary[],
  mcps: McpSummary[],
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (key.allowedFunctionIds === null && key.allowedMcpIds === null) {
    return t('apiKeys.scopeAll')
  }
  const functionNames = new Map(functions.map((item) => [item.id, item.name]))
  const mcpNames = new Map(mcps.map((item) => [item.id, item.name]))
  const scopes = [
    ...(key.allowedMcpIds ?? []).map((id) =>
      t('apiKeys.mcpScope', {
        name: mcpNames.get(id) ?? t('apiKeys.mcpId', { id }),
      }),
    ),
    ...(key.allowedFunctionIds ?? []).map(
      (id) => functionNames.get(id) ?? t('apiKeys.functionId', { id }),
    ),
  ]
  return scopes.length === 0 ? t('apiKeys.scopeNone') : scopes.join(', ')
}

async function readApiError(response: Response, fallback: string) {
  try {
    const body = (await response.clone().json()) as { message?: unknown }
    return typeof body.message === 'string' ? body.message : fallback
  } catch {
    return fallback
  }
}

function getErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback
}
