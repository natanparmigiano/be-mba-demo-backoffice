import type { CommonAppType } from '@mba-desk/api-core'
import { hc } from 'hono/client'

export const apiClient = hc<CommonAppType>('/')
