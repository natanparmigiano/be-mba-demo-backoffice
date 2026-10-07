import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export type PlaygroundOperationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: unknown }
  | { status: 'error'; message: string }

export function usePlaygroundOperation() {
  const { t } = useTranslation()
  const [state, setState] = useState<PlaygroundOperationState>({
    status: 'idle',
  })

  const run = async (request: () => Promise<unknown>) => {
    setState({ status: 'loading' })
    try {
      setState({ status: 'success', result: await request() })
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('apiPlayground.operationFailed'),
      })
    }
  }

  return { state, run }
}

export async function readPlaygroundResult(
  response: Response,
  t: TFunction,
): Promise<unknown> {
  const body: unknown = await response.json()
  if (!response.ok) {
    throw new Error(
      readMessage(body) ??
        t('apiPlayground.requestFailed', { status: response.status }),
    )
  }
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error(t('apiPlayground.unexpectedResponse'))
  }
  return body.result
}

export function readMessage(value: unknown): string | undefined {
  return typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
    ? value.message
    : undefined
}
