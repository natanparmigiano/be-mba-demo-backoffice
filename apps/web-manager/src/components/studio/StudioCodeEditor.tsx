import Editor, { loader } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

loader.config({ monaco: monacoEditor })
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

export function StudioCodeEditor({
  language,
  path,
  theme,
  value,
  onChange,
  ariaLabel,
  readOnly = false,
}: {
  language: 'javascript' | 'json' | 'markdown' | 'yaml'
  path: string
  theme: 'light' | 'dark'
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  readOnly?: boolean
}) {
  return (
    <Editor
      key={`${path}-${readOnly ? 'readonly' : 'editable'}`}
      height="100%"
      language={language}
      path={path}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      value={value}
      onChange={readOnly ? undefined : (next) => onChange(next ?? '')}
      options={{
        automaticLayout: true,
        fontSize: 13,
        lineHeight: 21,
        minimap: { enabled: true, scale: 1 },
        padding: { top: 12 },
        scrollBeyondLastLine: false,
        tabSize: 2,
        wordWrap: language === 'markdown' ? 'on' : 'off',
        readOnly,
        domReadOnly: readOnly,
        ariaLabel,
      }}
    />
  )
}
