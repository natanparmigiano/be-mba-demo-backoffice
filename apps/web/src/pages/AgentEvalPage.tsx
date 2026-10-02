import type { InferResponseType } from 'hono/client'
import type { TFunction } from 'i18next'
import {
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  FlaskConical,
  Play,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { apiClient } from '../api'
import { authClient } from '../auth/auth-client'
import { Button, Pill, SectionCard } from '../components/ui'

type ChannelsResponse = InferResponseType<
  typeof apiClient.api.channels.$get,
  200
>
type ChannelSummary = ChannelsResponse['channels'][number]
type EvaluationEndpoint = (typeof apiClient.api.channels)[':id']['agent-evals']
type EvaluationCasesResponse = InferResponseType<
  EvaluationEndpoint['$get'],
  200
>
type EvaluationCase = EvaluationCasesResponse['cases'][number]
type EvaluationJobResponse = InferResponseType<
  EvaluationEndpoint['runs'][':jobId']['$get'],
  200
>
type EvaluationJob = EvaluationJobResponse['job']

export function AgentEvalPage() {
  const { t } = useTranslation()
  const { id, evalCaseId } = useParams()
  const channelId = parsePositiveId(id)
  const activeOrganizationQuery = authClient.useActiveOrganization()
  const activeMemberRoleQuery = authClient.useActiveMemberRole()
  const activeOrganizationId = activeOrganizationQuery.data?.id
  const canManage = (activeMemberRoleQuery.data?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .some((role) => role === 'owner' || role === 'admin')

  const [channel, setChannel] = useState<ChannelSummary | null>(null)
  const [evaluation, setEvaluation] = useState<EvaluationCase | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<EvaluationJob | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `${t('evaluation.title')} · ${t('design.brand')}`
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('evaluation.metaDescription'))
  }, [t])

  useEffect(() => {
    if (!activeOrganizationId || !channelId || !evalCaseId) {
      setChannel(null)
      setEvaluation(null)
      setIsLoading(false)
      setError(
        !channelId ? t('evaluation.invalidChannel') : t('evaluation.invalid'),
      )
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setJobId(null)
    setJob(null)
    void (async () => {
      try {
        const [channelsResponse, evaluationsResponse] = await Promise.all([
          apiClient.api.channels.$get(),
          apiClient.api.channels[':id']['agent-evals'].$get({
            param: { id: String(channelId) },
          }),
        ])
        if (!channelsResponse.ok) {
          throw new Error(
            await readApiError(channelsResponse, t('evaluation.loadFailed')),
          )
        }
        if (!evaluationsResponse.ok) {
          throw new Error(
            await readApiError(evaluationsResponse, t('evaluation.loadFailed')),
          )
        }
        const selectedChannel = (await channelsResponse.json()).channels.find(
          (item) => item.id === channelId,
        )
        const selectedEvaluation = (
          await evaluationsResponse.json()
        ).cases.find((item) => item.id === evalCaseId)
        if (!selectedChannel) throw new Error(t('agent.channelNotFound'))
        if (!selectedEvaluation) throw new Error(t('evaluation.notFound'))
        if (cancelled) return
        setChannel(selectedChannel)
        setEvaluation(selectedEvaluation)
      } catch (reason) {
        if (!cancelled) {
          setError(getErrorMessage(reason, t('evaluation.loadFailed')))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeOrganizationId, channelId, evalCaseId, t])

  useEffect(() => {
    if (!channelId || !jobId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const refresh = async () => {
      try {
        const response = await apiClient.api.channels[':id'][
          'agent-evals'
        ].runs[':jobId'].$get({
          param: { id: String(channelId), jobId },
        })
        if (!response.ok) {
          throw new Error(
            await readApiError(response, t('evaluation.jobLoadFailed')),
          )
        }
        const nextJob = (await response.json()).job
        if (cancelled) return
        setJob(nextJob)
        if (!isTerminalStatus(nextJob.status)) {
          timer = setTimeout(() => void refresh(), 2_000)
        }
      } catch (reason) {
        if (!cancelled) {
          setError(getErrorMessage(reason, t('evaluation.jobLoadFailed')))
        }
      }
    }

    void refresh()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [channelId, jobId, t])

  const runEvaluation = async () => {
    if (!channelId || !evaluation || isStarting) return
    setIsStarting(true)
    setError(null)
    setJobId(null)
    setJob(null)
    try {
      const response = await apiClient.api.channels[':id']['agent-evals'].runs[
        '$post'
      ]({
        param: { id: String(channelId) },
        json: { evalCaseIds: [evaluation.id] },
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, t('evaluation.runFailed')))
      }
      const run = await response.json()
      setJob({ status: run.status, progress: null, result: null, error: null })
      setJobId(run.jobId)
    } catch (reason) {
      setError(getErrorMessage(reason, t('evaluation.runFailed')))
    } finally {
      setIsStarting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
        {t('evaluation.loading')}
      </div>
    )
  }

  if (!channel || !evaluation) {
    return (
      <p
        className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        role="alert"
      >
        {error ?? t('evaluation.notFound')}
      </p>
    )
  }

  const progressPercent = job?.progress
    ? Math.min(
        100,
        Math.max(0, (job.progress.completed / job.progress.total) * 100 || 0),
      )
    : 0

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
        <Link
          aria-label={t('evaluation.back')}
          className="grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
          to={`/agents/${channel.id}`}
        >
          <ChevronLeft className="size-5" />
        </Link>
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
          <FlaskConical className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {t('evaluation.eyebrow', {
              phoneNumber: `${channel.name} · ${channel.waPhoneNumber}`,
            })}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
            {evaluation.scenario}
          </h1>
        </div>
        {job && (
          <Pill tone={evaluationStatusTone(job.status)} dot>
            {evaluationStatusLabel(job.status, t)}
          </Pill>
        )}
      </header>

      {error && (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <SectionCard
        action={
          canManage ? (
            <Button
              disabled={Boolean(job && !isTerminalStatus(job.status))}
              isLoading={isStarting}
              onClick={() => void runEvaluation()}
            >
              <Play className="size-4" aria-hidden />
              {t(jobId ? 'evaluation.runAgain' : 'evaluation.run')}
            </Button>
          ) : undefined
        }
        description={t('evaluation.caseDescription')}
        title={t('evaluation.caseTitle')}
      >
        <dl className="grid gap-5 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">
              {t('evaluation.caseId')}
            </dt>
            <dd className="mt-1 break-all text-sm font-semibold">
              {evaluation.id}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">
              {t('evaluation.version')}
            </dt>
            <dd className="mt-1 text-sm font-semibold">
              {evaluation.scenarioVersion ?? t('evaluation.notAvailable')}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">
              {t('evaluation.maximumTurns')}
            </dt>
            <dd className="mt-1 text-sm font-semibold">
              {evaluation.maxTurns ?? t('evaluation.notAvailable')}
            </dd>
          </div>
        </dl>

        {evaluation.categories.length > 0 && (
          <div className="mt-6 border-t pt-5">
            <h3 className="text-sm font-bold">{t('evaluation.categories')}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {evaluation.categories.map((category) => (
                <Pill key={category}>{category}</Pill>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 border-t pt-5">
          <h3 className="text-sm font-bold">
            {t('evaluation.successCriteria')}
          </h3>
          {evaluation.successCriteria.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t('evaluation.noSuccessCriteria')}
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {evaluation.successCriteria.map((criterion) => (
                <li className="flex items-start gap-2 text-sm" key={criterion}>
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden
                  />
                  <span>{criterion}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!canManage && (
          <p className="mt-6 border-t pt-5 text-sm text-muted-foreground">
            {t('evaluation.managersOnly')}
          </p>
        )}
      </SectionCard>

      <SectionCard
        description={t('evaluation.resultsDescription')}
        title={t('evaluation.resultsTitle')}
      >
        {!job ? (
          <div className="grid min-h-32 place-items-center text-center">
            <div>
              <FlaskConical
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden
              />
              <p className="mt-3 text-sm text-muted-foreground">
                {t('evaluation.noResults')}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  {t('evaluation.status')}
                </p>
                <p className="mt-1 font-bold">
                  {evaluationStatusLabel(job.status, t)}
                </p>
              </div>
              {jobId && (
                <p className="text-xs text-muted-foreground">
                  {t('evaluation.jobId', { id: jobId })}
                </p>
              )}
            </div>

            {job.progress && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold">
                    {job.progress.currentStage}
                  </span>
                  <span className="text-muted-foreground">
                    {t('evaluation.progress', {
                      completed: job.progress.completed,
                      total: job.progress.total,
                    })}
                  </span>
                </div>
                <div
                  aria-label={t('evaluation.progressLabel')}
                  aria-valuemax={job.progress.total}
                  aria-valuemin={0}
                  aria-valuenow={job.progress.completed}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {job.error && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div>
                  <p className="font-bold">{job.error.code}</p>
                  <p className="mt-1 text-sm">{job.error.message}</p>
                </div>
              </div>
            )}

            {job.result && (
              <div className="grid gap-5 border-t pt-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ScoreCard
                    label={t('evaluation.conversationScore')}
                    value={job.result.avgConversationScore}
                  />
                  <ScoreCard
                    label={t('evaluation.turnScore')}
                    value={job.result.avgTurnScore}
                  />
                </div>
                <ResultText
                  label={t('evaluation.summary')}
                  value={job.result.summary}
                />
                <ResultText
                  label={t('evaluation.highlights')}
                  value={job.result.highlights}
                />
                <ResultText
                  label={t('evaluation.failureCategories')}
                  value={job.result.topFailureCategories}
                />
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black">
        {value === null
          ? '—'
          : new Intl.NumberFormat(undefined, {
              maximumFractionDigits: 2,
            }).format(value)}
      </p>
    </div>
  )
}

function ResultText({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <h3 className="text-sm font-bold">{label}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {value}
      </p>
    </div>
  )
}

function isTerminalStatus(status: string): boolean {
  return ['CANCELLED', 'COMPLETED', 'ERROR', 'FAILED', 'SUCCEEDED'].includes(
    status.toUpperCase(),
  )
}

function evaluationStatusTone(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'COMPLETED' || normalized === 'SUCCEEDED') {
    return 'success' as const
  }
  if (normalized === 'ERROR' || normalized === 'FAILED') {
    return 'danger' as const
  }
  if (normalized === 'CANCELLED') return 'warning' as const
  return 'primary' as const
}

function evaluationStatusLabel(status: string, t: TFunction): string {
  const key = status.toUpperCase()
  if (key === 'QUEUED') return t('evaluation.statuses.queued')
  if (key === 'RUNNING') return t('evaluation.statuses.running')
  if (key === 'COMPLETED') return t('evaluation.statuses.completed')
  if (key === 'SUCCEEDED') return t('evaluation.statuses.succeeded')
  if (key === 'FAILED') return t('evaluation.statuses.failed')
  if (key === 'ERROR') return t('evaluation.statuses.error')
  if (key === 'CANCELLED') return t('evaluation.statuses.cancelled')
  return status
}

function parsePositiveId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

async function readApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: unknown }
    return typeof body.message === 'string' ? body.message : fallback
  } catch {
    return fallback
  }
}

function getErrorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}
