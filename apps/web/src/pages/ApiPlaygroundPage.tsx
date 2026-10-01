import type { InferResponseType } from 'hono/client'
import {
  AlertTriangle,
  CheckCircle2,
  Phone,
  RadioTower,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import {
  PlaygroundOperationCard as OperationCard,
  type PlaygroundOperationState as OperationState,
} from '../components/api-playground/PlaygroundOperationCard'
import { MessagingPlayground } from './ApiPlaygroundMessaging'
import { MediaPlayground } from './ApiPlaygroundMedia'
import { QrPlayground } from './ApiPlaygroundQr'
import { ComponentsPlayground } from './ApiPlaygroundComponents'
import { FlowsPlayground } from './ApiPlaygroundFlows'
import { TemplatesPlayground } from './ApiPlaygroundTemplates'
import { Button, Checkbox, cn, Input, Select, Tabs } from '../components/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelSummary = ChannelsResponse['channels'][number]
type OperationKey =
  | 'phoneNumber'
  | 'requestCode'
  | 'verifyCode'
  | 'register'
  | 'twoStepPin'
  | 'deregister'
type PackageTab =
  | 'registration'
  | 'messaging'
  | 'media'
  | 'qr'
  | 'components'
  | 'flows'
  | 'templates'

const initialOperationStates: Record<OperationKey, OperationState> = {
  phoneNumber: { status: 'idle' },
  requestCode: { status: 'idle' },
  verifyCode: { status: 'idle' },
  register: { status: 'idle' },
  twoStepPin: { status: 'idle' },
  deregister: { status: 'idle' },
}

const DATA_LOCALIZATION_REGIONS = [
  'AU',
  'BH',
  'BR',
  'CA',
  'CH',
  'DE',
  'GB',
  'ID',
  'IN',
  'JP',
  'KR',
  'SG',
  'ZA',
  'AE',
] as const

const PHONE_NUMBER_FIELDS = [
  {
    value: 'display_phone_number',
    labelKey:
      'apiPlayground.registration.phoneNumber.fieldOptions.displayPhoneNumber',
  },
  {
    value: 'verified_name',
    labelKey:
      'apiPlayground.registration.phoneNumber.fieldOptions.verifiedName',
  },
  {
    value: 'quality_rating',
    labelKey:
      'apiPlayground.registration.phoneNumber.fieldOptions.qualityRating',
  },
  {
    value: 'code_verification_status',
    labelKey:
      'apiPlayground.registration.phoneNumber.fieldOptions.codeVerificationStatus',
  },
  {
    value: 'name_status',
    labelKey: 'apiPlayground.registration.phoneNumber.fieldOptions.nameStatus',
  },
  {
    value: 'status',
    labelKey: 'apiPlayground.registration.phoneNumber.fieldOptions.status',
  },
] as const

export function ApiPlaygroundPage() {
  const { t } = useTranslation()
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const canMutate = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [activeTab, setActiveTab] = useState<PackageTab>('registration')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [isLoadingChannels, setIsLoadingChannels] = useState(true)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [operationStates, setOperationStates] = useState(initialOperationStates)
  const [selectedFields, setSelectedFields] = useState<string[]>(
    PHONE_NUMBER_FIELDS.map((field) => field.value),
  )
  const [codeMethod, setCodeMethod] = useState<'SMS' | 'VOICE'>('SMS')
  const [language, setLanguage] = useState('en_US')
  const [verificationCode, setVerificationCode] = useState('')
  const [registrationPin, setRegistrationPin] = useState('')
  const [localizationRegion, setLocalizationRegion] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmDeregister, setConfirmDeregister] = useState(false)

  useEffect(() => {
    document.title = `${t('apiPlayground.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('apiPlayground.metaDescription'))
  }, [t])

  const refreshChannels = useCallback(async () => {
    if (!activeOrganizationId) {
      setChannels([])
      setSelectedChannelId('')
      setIsLoadingChannels(false)
      return
    }

    setIsLoadingChannels(true)
    setChannelsError(null)
    try {
      const response = await apiClient.api.channels.$get()
      if (!response.ok) {
        throw new Error(
          await readApiError(response, t('apiPlayground.loadChannelsFailed')),
        )
      }
      const data = await response.json()
      setChannels(data.channels)
      setSelectedChannelId((current) =>
        data.channels.some((channel) => String(channel.id) === current)
          ? current
          : String(data.channels[0]?.id ?? ''),
      )
    } catch (error) {
      setChannels([])
      setSelectedChannelId('')
      setChannelsError(
        getErrorMessage(error, t('apiPlayground.loadChannelsFailed')),
      )
    } finally {
      setIsLoadingChannels(false)
    }
  }, [activeOrganizationId, t])

  useEffect(() => {
    setOperationStates(initialOperationStates)
    void refreshChannels()
  }, [refreshChannels])

  const selectChannel = (channelId: string) => {
    setSelectedChannelId(channelId)
    setOperationStates(initialOperationStates)
    setConfirmDeregister(false)
  }

  const togglePhoneNumberField = (field: string, checked: boolean) => {
    setSelectedFields((current) =>
      checked
        ? [...current, field]
        : current.filter((selected) => selected !== field),
    )
  }

  const runOperation = async (
    operation: OperationKey,
    request: (channelId: string) => Promise<Response>,
  ) => {
    if (!selectedChannelId) return
    setOperationStates((current) => ({
      ...current,
      [operation]: { status: 'loading' },
    }))
    try {
      const response = await request(selectedChannelId)
      const result = await readApiResult(
        response,
        t('apiPlayground.requestFailed', { status: response.status }),
        t('apiPlayground.unexpectedResponse'),
      )
      setOperationStates((current) => ({
        ...current,
        [operation]: { status: 'success', result },
      }))
    } catch (error) {
      setOperationStates((current) => ({
        ...current,
        [operation]: {
          status: 'error',
          message: getErrorMessage(error, t('apiPlayground.operationFailed')),
        },
      }))
    }
  }

  const selectedChannel = channels.find(
    (channel) => String(channel.id) === selectedChannelId,
  )
  const mutationDisabled = !selectedChannel || !canMutate

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
          {t('apiPlayground.eyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
          {t('apiPlayground.title')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {t('apiPlayground.description')}
        </p>
      </header>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-4 border-b bg-muted/25 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <RadioTower className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-bold">{t('apiPlayground.channelLabel')}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t('apiPlayground.selectChannelHint')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoadingChannels}
            isLoading={isLoadingChannels}
            onClick={() => void refreshChannels()}
          >
            <RefreshCw className="size-4" aria-hidden />
            {t('apiPlayground.refreshChannels')}
          </Button>
        </div>
        <div className="p-5 sm:p-6">
          {isLoadingChannels ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-24 animate-pulse rounded-xl border bg-muted/45"
                />
              ))}
            </div>
          ) : channels.length > 0 ? (
            <div
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              role="radiogroup"
              aria-label={t('apiPlayground.channelLabel')}
            >
              {channels.map((channel) => {
                const isSelected = String(channel.id) === selectedChannelId
                return (
                  <button
                    key={channel.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={cn(
                      'group relative cursor-pointer rounded-xl border p-4 text-left shadow-xs transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
                      isSelected
                        ? 'border-primary bg-primary/7 ring-1 ring-primary/20'
                        : 'bg-background hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm',
                    )}
                    onClick={() => selectChannel(String(channel.id))}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-lg transition-colors',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground group-hover:text-primary',
                        )}
                      >
                        <Phone className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">
                          {channel.waPhoneNumber}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                          {t('apiPlayground.channelHint', {
                            phoneNumberId: channel.waPhoneNumberId,
                          })}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                          {t('apiPlayground.wabaHint', {
                            wabaId: channel.waWabaId,
                          })}
                        </span>
                      </span>
                      <CheckCircle2
                        className={cn(
                          'size-5 shrink-0 transition-opacity',
                          isSelected ? 'text-primary opacity-100' : 'opacity-0',
                        )}
                        aria-hidden
                      />
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
              <RadioTower
                className="mx-auto size-6 text-muted-foreground"
                aria-hidden
              />
              <p className="mt-2 text-sm font-semibold">
                {t('apiPlayground.noChannels')}
              </p>
            </div>
          )}
          {channelsError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {channelsError}
            </p>
          )}
          {!canMutate && (
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {t('apiPlayground.managersOnly')}
            </p>
          )}
        </div>
      </section>

      <Tabs
        items={[
          {
            value: 'registration',
            label: t('apiPlayground.registration.tab'),
          },
          {
            value: 'messaging',
            label: t('apiPlayground.messaging.tab'),
          },
          {
            value: 'media',
            label: t('apiPlayground.media.tab'),
          },
          {
            value: 'qr',
            label: t('apiPlayground.qr.tab'),
          },
          {
            value: 'components',
            label: t('apiPlayground.components.tab'),
          },
          {
            value: 'flows',
            label: t('apiPlayground.flows.tab'),
          },
          {
            value: 'templates',
            label: t('apiPlayground.templates.tab'),
          },
        ]}
        value={activeTab}
        onValueChange={setActiveTab}
        ariaLabel={t('apiPlayground.tabsLabel')}
      />

      {activeTab === 'registration' ? (
        <div
          className="grid gap-4"
          role="tabpanel"
          aria-label={t('apiPlayground.registration.tab')}
        >
          <OperationCard
            method="GET"
            title={t('apiPlayground.registration.phoneNumber.title')}
            description={t(
              'apiPlayground.registration.phoneNumber.description',
            )}
            action={t('apiPlayground.registration.phoneNumber.action')}
            state={operationStates.phoneNumber}
            disabled={!selectedChannel}
            onSubmit={() => {
              void runOperation('phoneNumber', (channelId) =>
                apiClient.api.playground.registration[':channelId'][
                  'phone-number'
                ].$get({
                  param: { channelId },
                  query: { fields: selectedFields.join(',') },
                }),
              )
            }}
            resultLabel={t('apiPlayground.result')}
            defaultOpen
          >
            <fieldset className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <legend className="text-sm font-semibold">
                    {t('apiPlayground.registration.phoneNumber.fields')}
                  </legend>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('apiPlayground.registration.phoneNumber.fieldsHint')}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSelectedFields(
                        PHONE_NUMBER_FIELDS.map((field) => field.value),
                      )
                    }
                  >
                    {t('apiPlayground.registration.phoneNumber.selectAll')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFields([])}
                  >
                    {t('apiPlayground.registration.phoneNumber.clear')}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PHONE_NUMBER_FIELDS.map((field) => (
                  <Checkbox
                    key={field.value}
                    className="w-full rounded-xl border bg-background p-3 transition-colors hover:border-primary/40"
                    label={t(field.labelKey)}
                    description={field.value}
                    checked={selectedFields.includes(field.value)}
                    onChange={(event) =>
                      togglePhoneNumberField(
                        field.value,
                        event.currentTarget.checked,
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
          </OperationCard>

          <OperationCard
            method="POST"
            title={t('apiPlayground.registration.requestCode.title')}
            description={t(
              'apiPlayground.registration.requestCode.description',
            )}
            action={t('apiPlayground.registration.requestCode.action')}
            state={operationStates.requestCode}
            disabled={mutationDisabled}
            onSubmit={() => {
              void runOperation('requestCode', (channelId) =>
                apiClient.api.playground.registration[':channelId'][
                  'request-code'
                ].$post({
                  param: { channelId },
                  json: { codeMethod, language },
                }),
              )
            }}
            resultLabel={t('apiPlayground.result')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label={t('apiPlayground.registration.requestCode.method')}
                value={codeMethod}
                onChange={(event) =>
                  setCodeMethod(event.currentTarget.value as 'SMS' | 'VOICE')
                }
              >
                <option value="SMS">SMS</option>
                <option value="VOICE">
                  {t('apiPlayground.registration.requestCode.voice')}
                </option>
              </Select>
              <Input
                label={t('apiPlayground.registration.requestCode.language')}
                hint={t('apiPlayground.registration.requestCode.languageHint')}
                value={language}
                required
                onChange={(event) => setLanguage(event.currentTarget.value)}
              />
            </div>
          </OperationCard>

          <OperationCard
            method="POST"
            title={t('apiPlayground.registration.verifyCode.title')}
            description={t('apiPlayground.registration.verifyCode.description')}
            action={t('apiPlayground.registration.verifyCode.action')}
            state={operationStates.verifyCode}
            disabled={mutationDisabled}
            onSubmit={() => {
              void runOperation('verifyCode', (channelId) =>
                apiClient.api.playground.registration[':channelId'][
                  'verify-code'
                ].$post({
                  param: { channelId },
                  json: { code: verificationCode },
                }),
              )
            }}
            resultLabel={t('apiPlayground.result')}
          >
            <Input
              label={t('apiPlayground.registration.verificationCode')}
              hint={t('apiPlayground.registration.sixDigits')}
              value={verificationCode}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              onChange={(event) =>
                setVerificationCode(event.currentTarget.value)
              }
            />
          </OperationCard>

          <OperationCard
            method="POST"
            title={t('apiPlayground.registration.register.title')}
            description={t('apiPlayground.registration.register.description')}
            action={t('apiPlayground.registration.register.action')}
            state={operationStates.register}
            disabled={mutationDisabled}
            onSubmit={() => {
              void runOperation('register', (channelId) =>
                apiClient.api.playground.registration[
                  ':channelId'
                ].register.$post({
                  param: { channelId },
                  json: {
                    pin: registrationPin,
                    ...(localizationRegion
                      ? {
                          dataLocalizationRegion:
                            localizationRegion as (typeof DATA_LOCALIZATION_REGIONS)[number],
                        }
                      : {}),
                  },
                }),
              )
            }}
            resultLabel={t('apiPlayground.result')}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="password"
                autoComplete="new-password"
                label={t('apiPlayground.registration.pin')}
                hint={t('apiPlayground.registration.sixDigits')}
                value={registrationPin}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                onChange={(event) =>
                  setRegistrationPin(event.currentTarget.value)
                }
              />
              <Select
                label={t('apiPlayground.registration.register.region')}
                hint={t('apiPlayground.registration.register.regionHint')}
                value={localizationRegion}
                onChange={(event) =>
                  setLocalizationRegion(event.currentTarget.value)
                }
              >
                <option value="">
                  {t('apiPlayground.registration.register.noRegion')}
                </option>
                {DATA_LOCALIZATION_REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </Select>
            </div>
          </OperationCard>

          <OperationCard
            method="POST"
            title={t('apiPlayground.registration.twoStepPin.title')}
            description={t('apiPlayground.registration.twoStepPin.description')}
            action={t('apiPlayground.registration.twoStepPin.action')}
            state={operationStates.twoStepPin}
            disabled={mutationDisabled}
            onSubmit={() => {
              void runOperation('twoStepPin', (channelId) =>
                apiClient.api.playground.registration[':channelId'][
                  'two-step-pin'
                ].$post({
                  param: { channelId },
                  json: { pin: newPin },
                }),
              )
            }}
            resultLabel={t('apiPlayground.result')}
          >
            <Input
              type="password"
              autoComplete="new-password"
              label={t('apiPlayground.registration.twoStepPin.newPin')}
              hint={t('apiPlayground.registration.sixDigits')}
              value={newPin}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              onChange={(event) => setNewPin(event.currentTarget.value)}
            />
          </OperationCard>

          <OperationCard
            method="POST"
            title={t('apiPlayground.registration.deregister.title')}
            description={t('apiPlayground.registration.deregister.description')}
            action={t('apiPlayground.registration.deregister.action')}
            state={operationStates.deregister}
            disabled={mutationDisabled || !confirmDeregister}
            buttonVariant="danger"
            onSubmit={() => {
              void runOperation('deregister', (channelId) =>
                apiClient.api.playground.registration[
                  ':channelId'
                ].deregister.$post({ param: { channelId } }),
              )
            }}
            resultLabel={t('apiPlayground.result')}
          >
            <div className="rounded-xl border border-warning/30 bg-warning/8 p-3">
              <div className="flex gap-2 text-sm font-semibold">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden
                />
                <span>
                  {t('apiPlayground.registration.deregister.warning')}
                </span>
              </div>
            </div>
            <Checkbox
              label={t('apiPlayground.registration.deregister.confirm')}
              checked={confirmDeregister}
              onChange={(event) =>
                setConfirmDeregister(event.currentTarget.checked)
              }
            />
          </OperationCard>
        </div>
      ) : activeTab === 'messaging' ? (
        <MessagingPlayground
          key={selectedChannelId}
          channelId={selectedChannelId}
          disabled={mutationDisabled}
        />
      ) : activeTab === 'media' ? (
        <MediaPlayground
          key={selectedChannelId}
          channelId={selectedChannelId}
          mutationDisabled={mutationDisabled}
        />
      ) : activeTab === 'qr' ? (
        <QrPlayground
          key={selectedChannelId}
          channelId={selectedChannelId}
          mutationDisabled={mutationDisabled}
        />
      ) : activeTab === 'components' ? (
        <ComponentsPlayground
          key={selectedChannelId}
          channelId={selectedChannelId}
          mutationDisabled={mutationDisabled}
        />
      ) : activeTab === 'flows' ? (
        <FlowsPlayground
          key={selectedChannelId}
          channelId={selectedChannelId}
          mutationDisabled={mutationDisabled}
        />
      ) : (
        <TemplatesPlayground
          key={selectedChannelId}
          channelId={selectedChannelId}
          mutationDisabled={mutationDisabled}
        />
      )}
    </div>
  )
}

async function readApiResult(
  response: Response,
  requestFailed: string,
  unexpectedResponse: string,
): Promise<unknown> {
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(readMessage(body) ?? requestFailed)
  }
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error(unexpectedResponse)
  }
  return body.result
}

async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    return readMessage((await response.json()) as unknown) ?? fallback
  } catch {
    return fallback
  }
}

function readMessage(value: unknown): string | undefined {
  return typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : undefined
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
