export interface ApplicationUrls {
  manager: string
  workspace: string
}

const developmentDefaults: ApplicationUrls = {
  manager: 'http://localhost:3001',
  workspace: 'http://localhost:3000',
}

export function getApplicationUrls(
  environment: NodeJS.ProcessEnv = process.env,
): ApplicationUrls {
  return {
    manager: readApplicationUrl(
      'MANAGER_URL',
      environment.MANAGER_URL,
      environment,
    ),
    workspace: readApplicationUrl(
      'WORKSPACE_URL',
      environment.WORKSPACE_URL,
      environment,
    ),
  }
}

function readApplicationUrl(
  name: keyof Pick<NodeJS.ProcessEnv, 'MANAGER_URL' | 'WORKSPACE_URL'>,
  value: string | undefined,
  environment: NodeJS.ProcessEnv,
): string {
  const configured = value?.trim()
  if (!configured) {
    if (environment.NODE_ENV === 'production') {
      throw new Error(`${name} is required in production`)
    }
    return name === 'MANAGER_URL'
      ? developmentDefaults.manager
      : developmentDefaults.workspace
  }

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) origin`)
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be an HTTP(S) origin without a path`)
  }
  return url.origin
}
