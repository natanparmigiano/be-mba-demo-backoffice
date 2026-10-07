import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/app/AppShell'
import { AdminPage } from '../pages/AdminPage'
import { ChatPage } from '../pages/ChatPage'
import { ContactsPage } from '../pages/ContactsPage'
import { GroupsPage } from '../pages/GroupsPage'
import { HomePage } from '../pages/HomePage'
import { LoginPage } from '../pages/LoginPage'
import { OrganizationPage } from '../pages/OrganizationPage'
import { QueuePage } from '../pages/QueuePage'
import { TemplatesPage } from '../pages/TemplatesPage'
import { TemplateSendingPage } from '../pages/TemplateSendingPage'
import { TeamsPage } from '../pages/TeamsPage'
import {
  AdminRoute,
  AuthSessionRoute,
  GuestRoute,
  PrivateRoute,
} from './RouteGuards'

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
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:chatId" element={<ChatPage />} />
              <Route path="/queue" element={<QueuePage />} />
              <Route path="/organization" element={<OrganizationPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route
                path="/template-sending"
                element={<TemplateSendingPage />}
              />
              <Route path="/templates/new" element={<TemplatesPage />} />
              <Route
                path="/templates/:channelId/:templateId"
                element={<TemplatesPage />}
              />
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
