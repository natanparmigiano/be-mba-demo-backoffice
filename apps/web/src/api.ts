import type { AppType } from '@mba-desk/api'
import { hc } from 'hono/client'

export const apiClient = hc<AppType>('/')
