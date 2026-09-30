import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DesignSystemPage } from '../DesignSystemPage'
import { AppShell } from '../components/app/AppShell'
import { AdminPage } from '../pages/AdminPage'
import { ChannelsPage } from '../pages/ChannelsPage'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { OrganizationPage } from '../pages/OrganizationPage'
import {
  AdminRoute,
  AuthSessionRoute,
  GuestRoute,
  PrivateRoute,
  PublicRoute,
} from './RouteGuards'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/design-system" element={<DesignSystemPage />} />
        </Route>

        <Route element={<AuthSessionRoute />}>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<PrivateRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/organization" element={<OrganizationPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
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
