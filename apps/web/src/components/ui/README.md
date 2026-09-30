# UI primitives

This folder is the reusable visual foundation of the frontend. Components are styled with Tailwind semantic tokens and support both themes without consumers supplying theme-specific classes.

Import public components through the barrel:

```tsx
import { Button, Input, Pill, Table } from '../components/ui'
```

## Component catalog

| Component                 | Main contract                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Alert`                   | Dismissible `primary`, `success`, or `warning` status with icon, title, and description.                    |
| `Avatar`                  | Initials avatar with `sm`, `md`, `lg`, or `xl` sizing and optional presence status.                         |
| `Button`                  | `primary`, `secondary`, `outline`, `ghost`, or `danger`; `sm`, `md`, `lg`, or `icon`; supports `isLoading`. |
| `Checkbox`                | Native checkbox with required label and optional description.                                               |
| `ColorSwatch`             | Design-system display helper for a named CSS variable.                                                      |
| `Dialog`                  | Controlled modal surface with Escape and backdrop dismissal.                                                |
| `EmptyState`              | Icon, title, description, and optional action.                                                              |
| `Input`                   | Forwarded native input with label, hint, error, and optional Lucide leading icon.                           |
| `Menu`                    | Composable popover menu with outside-click dismissal and keyboard navigation.                               |
| `Pagination`              | Controlled page navigation with a compact three-page window.                                                |
| `Pill`                    | Neutral, primary, success, warning, or danger status label with optional dot.                               |
| `SearchBox`               | Styled native search input with a leading search icon.                                                      |
| `SectionCard`             | Titled card used to organize design-system examples.                                                        |
| `SectionHeading`          | Eyebrow, title, and description for catalog sections.                                                       |
| `Select`                  | Forwarded native select with label and hint.                                                                |
| `StatCard`                | Metric, label, change, and icon presentation.                                                               |
| `Switch`                  | Native checkbox rendered as a switch with label and optional description.                                   |
| `Table` and subcomponents | Responsive table wrapper and semantic table building blocks.                                                |
| `Tabs`                    | Controlled typed tab list; values are inferred from `TabItem<Value>`.                                       |
| `Textarea`                | Forwarded native textarea with label, hint, and error.                                                      |
| `Toast`                   | Presentational status notification.                                                                         |
| `useTimedToast`           | Local toast lifecycle with configurable auto-dismiss duration.                                              |

## Usage patterns

### Button

```tsx
<Button variant="secondary" size="lg" isLoading={isSaving}>
  Save changes
</Button>
```

`isLoading` disables the native button and inserts a spinner. Consumers remain responsible for changing the visible label when desired.

### Form controls

```tsx
<Input
  label={t('profile.email')}
  labelAction={
    <Button size="sm" variant="ghost">
      Generate
    </Button>
  }
  error={emailError}
  value={email}
  onChange={(event) => setEmail(event.target.value)}
/>
```

`Input`, `Select`, and `Textarea` reserve consistent label and description rows so controls stay aligned when only some fields have hints. `labelAction` places a compact action beside the label without changing that alignment. `Input` and `Textarea` connect hint/error content through `aria-describedby` and expose invalid state with `aria-invalid`. `Checkbox`, `Switch`, and `Select` preserve native form behavior underneath their presentation.

### Tables

Build tables from the exported semantic pieces:

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Example</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

The wrapper owns horizontal overflow and a minimum table width.

## Styling and extension

`cn()` joins truthy class names; it is intentionally small and does not use `tailwind-merge`. Avoid passing conflicting utilities as an override mechanism. Add an explicit prop/variant when consumers need a stable new behavior.

When adding a primitive:

1. Define a small typed public contract.
2. Preserve native semantics where practical.
3. Cover keyboard focus, disabled, error, and loading states as applicable.
4. Use semantic theme tokens.
5. Export it from `index.ts`.
6. Add a localized example to the public design system.
