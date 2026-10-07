import type { AppType } from '@mba-desk/api-workspace'
import { hc } from 'hono/client'

export const apiClient = hc<AppType>('/')
