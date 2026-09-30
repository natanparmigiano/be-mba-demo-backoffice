import type { AppType } from '@mba-demo/api'
import { hc } from 'hono/client'

export const apiClient = hc<AppType>('/')
