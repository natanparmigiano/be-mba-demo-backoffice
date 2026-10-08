import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/app/AppShell'
import { AdminPage } from '../pages/AdminPage'
import { AgentPage } from '../pages/AgentPage'
import { AgentConnectorPage } from '../pages/AgentConnectorPage'
import { AgentEvalPage } from '../pages/AgentEvalPage'
import { ApiPlaygroundPage } from '../pages/ApiPlaygroundPage'
import { AgentsPage } from '../pages/AgentsPage'
import { ChannelsPage } from '@mba-desk/web-shared'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { OrganizationPage } from '../pages/OrganizationPage'
import { StudioPage } from '../pages/StudioPage'
import { StudioHomePage } from '../pages/StudioHomePage'
import { WebhooksPage } from '../pages/WebhooksPage'
import {
  AdminRoute,
  AuthSessionRoute,
  GuestRoute,
  PrivateRoute,
} from './RouteGuards'

const FunctionsPage = lazy(async () => {
  const module = await import('../pages/FunctionsPage')
  return { default: module.FunctionsPage }
})

const ApiKeysPage = lazy(async () => {
  const module = await import('../pages/ApiKeysPage')
  return { default: module.ApiKeysPage }
})

const McpsPage = lazy(async () => {
  const module = await import('../pages/McpsPage')
  return { default: module.McpsPage }
})

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthSessionRoute />}>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<PrivateRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/studio" element={<StudioHomePage />} />
              <Route path="/studio/:projectId" element={<StudioPage />} />
              <Route path="/organization" element={<OrganizationPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agents/:id" element={<AgentPage />} />
              <Route
                path="/agents/:id/connectors/:connectorId"
                element={<AgentConnectorPage />}
              />
              <Route
                path="/agents/:id/evals/:evalCaseId"
                element={<AgentEvalPage />}
              />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/channels/new" element={<ChannelsPage />} />
              <Route path="/channels/:channelId" element={<ChannelsPage />} />
              <Route path="/webhooks" element={<WebhooksPage />} />
              <Route
                path="/functions"
                element={
                  <Suspense fallback={null}>
                    <FunctionsPage />
                  </Suspense>
                }
              />
              <Route
                path="/mcps"
                element={
                  <Suspense fallback={null}>
                    <McpsPage />
                  </Suspense>
                }
              />
              <Route
                path="/api-keys"
                element={
                  <Suspense fallback={null}>
                    <ApiKeysPage />
                  </Suspense>
                }
              />
              <Route path="/playground" element={<ApiPlaygroundPage />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
