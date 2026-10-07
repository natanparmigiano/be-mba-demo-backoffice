export const DEFAULT_PRIMARY_COLOR = '#0866ff'
export const PRIMARY_COLOR_STORAGE_KEY = 'mba-desk-primary-color'

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

export function normalizePrimaryColor(color: string | null | undefined) {
  return color && HEX_COLOR_PATTERN.test(color)
    ? color.toLowerCase()
    : DEFAULT_PRIMARY_COLOR
}

export function applyOrganizationPrimaryColor(
  color: string | null | undefined,
) {
  const normalizedColor = normalizePrimaryColor(color)
  document.documentElement.style.setProperty('--primary', normalizedColor)

  try {
    window.localStorage.setItem(PRIMARY_COLOR_STORAGE_KEY, normalizedColor)
  } catch {
    // The organization color still works for this session without storage.
  }
}

export function resetOrganizationPrimaryColor() {
  document.documentElement.style.setProperty('--primary', DEFAULT_PRIMARY_COLOR)

  try {
    window.localStorage.removeItem(PRIMARY_COLOR_STORAGE_KEY)
  } catch {
    // The default color still applies for this session without storage.
  }
}
