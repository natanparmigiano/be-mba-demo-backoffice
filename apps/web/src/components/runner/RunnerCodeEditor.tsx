import Editor, { loader, type Monaco, type OnMount } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import typescriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useEffect, useRef } from 'react'

loader.config({ monaco: monacoEditor })
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    return label === 'javascript' || label === 'typescript'
      ? new typescriptWorker()
      : new editorWorker()
  },
}

export interface RunnerEditorParameter {
  name: string
  type: 'boolean' | 'integer' | 'json' | 'number' | 'string'
  required: boolean
  description?: string | null
}

export function RunnerCodeEditor({
  functionId,
  parameters,
  readOnly,
  theme,
  value,
  onChange,
}: {
  functionId: number
  parameters: RunnerEditorParameter[]
  readOnly: boolean
  theme: 'light' | 'dark'
  value: string
  onChange: (value: string) => void
}) {
  const monacoRef = useRef<Monaco | null>(null)
  const parameterTypesRef = useRef<{ dispose(): void } | null>(null)

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    parameterTypesRef.current?.dispose()
    parameterTypesRef.current = addParameterTypes(monaco, parameters)
    return () => parameterTypesRef.current?.dispose()
  }, [parameters])

  const handleEditorMount: OnMount = (_editor, monaco) => {
    monacoRef.current = monaco
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      allowJs: true,
      checkJs: true,
      target: monaco.languages.typescript.ScriptTarget.ES2020,
    })
    parameterTypesRef.current?.dispose()
    parameterTypesRef.current = addParameterTypes(monaco, parameters)
  }

  return (
    <Editor
      height="420px"
      language="javascript"
      path={`runner-function-${functionId}.js`}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      value={value}
      onChange={(nextValue) => onChange(nextValue ?? '')}
      onMount={handleEditorMount}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        tabSize: 2,
        readOnly,
        scrollBeyondLastLine: false,
        suggestOnTriggerCharacters: true,
      }}
    />
  )
}

function addParameterTypes(
  monaco: Monaco,
  parameters: RunnerEditorParameter[],
) {
  return monaco.languages.typescript.javascriptDefaults.addExtraLib(
    createParameterTypeLibrary(parameters),
    'inmemory://runner/parameters.d.ts',
  )
}

function createParameterTypeLibrary(
  parameters: RunnerEditorParameter[],
): string {
  const properties = parameters.map((parameter) => {
    const optional = parameter.required ? '' : '?'
    const type =
      parameter.type === 'integer'
        ? 'number'
        : parameter.type === 'json'
          ? 'unknown'
          : parameter.type
    const description = parameter.description
      ? `  /** ${parameter.description.replaceAll('*/', '* /')} */\n`
      : ''
    return `${description}  ${JSON.stringify(parameter.name)}${optional}: ${type};`
  })
  return `interface RunnerParameters {\n${properties.join('\n')}\n}`
}
