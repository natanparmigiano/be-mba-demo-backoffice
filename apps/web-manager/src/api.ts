import type { AppType } from '@mba-desk/api-manager'
import { hc } from 'hono/client'

export const apiClient = hc<AppType>('/')
