export const designSystemSections = [
  {
    id: 'foundations',
    translationKey: 'design.nav.foundations',
    searchAliases: 'colors tokens typography type scale theme',
  },
  {
    id: 'buttons',
    translationKey: 'design.nav.buttons',
    searchAliases:
      'buttons actions primary secondary outline ghost destructive loading',
  },
  {
    id: 'forms',
    translationKey: 'design.nav.forms',
    searchAliases:
      'forms input textarea search select checkbox switch validation',
  },
  {
    id: 'navigation',
    translationKey: 'design.nav.navigation',
    searchAliases: 'navigation tabs pills pagination badge',
  },
  {
    id: 'data',
    translationKey: 'design.nav.data',
    searchAliases: 'data table cards avatars statistics members',
  },
  {
    id: 'feedback',
    translationKey: 'design.nav.feedback',
    searchAliases: 'feedback alerts dialog modal toast empty state progress',
  },
  {
    id: 'chat',
    translationKey: 'design.nav.chat',
    searchAliases: 'chat conversation message communication whatsapp',
  },
] as const

export type DesignSystemSectionId = (typeof designSystemSections)[number]['id']
