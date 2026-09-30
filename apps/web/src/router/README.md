# Routing and access guards

React Router owns navigation. Routes are grouped by access policy rather than embedding session checks into individual pages.

## Route classes

### Public routes

`PublicRoute` renders its outlet without loading a session. `/design-system` is public by design.

### Guest routes

`GuestRoute` waits for session resolution, then:

- renders the outlet when no session exists;
- redirects an authenticated user to `/`.

The login page is a guest route.

### Private routes

`PrivateRoute` waits for session resolution, then:

- renders the outlet for an authenticated session;
- redirects an unauthenticated visitor to `/login`.

The redirect stores `pathname`, `search`, and `hash` in `AuthRedirectState`. After successful login, `LoginPage` restores this location.

### Session boundary

`AuthSessionRoute` installs `AuthProvider` once around both guest and private branches. Public routes remain independent of Better Auth.

## Current route tree

```text
BrowserRouter
├── PublicRoute
│   └── /design-system -> DesignSystemPage
├── AuthSessionRoute
│   ├── GuestRoute
│   │   └── /login -> LoginPage
│   └── PrivateRoute
│       └── / -> HomePage
└── * -> /
```

During the initial session check, both guest and private guards render the localized `SessionLoading` screen. This avoids rendering protected content before authentication is known.

## Adding routes

Add each route under exactly one policy:

```tsx
<Route element={<PublicRoute />}>
  <Route path="/public-example" element={<PublicExamplePage />} />
</Route>

<Route element={<AuthSessionRoute />}>
  <Route element={<GuestRoute />}>
    <Route path="/register" element={<RegisterPage />} />
  </Route>
  <Route element={<PrivateRoute />}>
    <Route path="/conversations" element={<ConversationsPage />} />
  </Route>
</Route>
```

Keep authorization separate from authentication. These guards answer whether a session exists; future role, tenant, or permission checks should have their own explicit boundary.
