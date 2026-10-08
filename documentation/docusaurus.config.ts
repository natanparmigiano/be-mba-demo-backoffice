import type { Config } from '@docusaurus/types'
import type { Options, ThemeConfig } from '@docusaurus/preset-classic'
import { themes as prismThemes } from 'prism-react-renderer'

const config: Config = {
  title: 'MBA Desk Documentation',
  tagline: 'Build, operate, and deploy MBA Desk with confidence.',
  favicon: 'signifier.png',

  // Reuse the application brand assets instead of maintaining a second logo.
  staticDirectories: ['static', '../lib/web-shared/src/assets'],

  url: process.env.DOCUSAURUS_URL ?? 'https://docs.example.com',
  baseUrl: process.env.DOCUSAURUS_BASE_URL ?? '/',
  organizationName: 'mba-desk',
  projectName: 'mba-desk',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onDuplicateRoutes: 'throw',
  markdown: {
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          breadcrumbs: true,
        },
        blog: false,
        pages: false,
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.svg',
    metadata: [
      {
        name: 'description',
        content:
          'Technical documentation for developing, operating, and deploying MBA Desk.',
      },
      { name: 'robots', content: 'index,follow' },
    ],
    navbar: {
      title: 'MBA Desk',
      logo: {
        alt: 'MBA Desk documentation',
        src: 'signifier.png',
      },
      items: [],
    },
    footer: {
      style: 'light',
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} MBA Desk.`,
    },
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'diff', 'docker', 'json', 'sql', 'yaml'],
    },
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
    },
  } satisfies ThemeConfig,
}

export default config
