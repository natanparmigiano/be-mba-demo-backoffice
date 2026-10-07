import { useEffect, useState } from 'react'
import type { ToastMessage } from './toast'

export function useTimedToast(duration = 3200) {
  const [message, setMessage] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!message) return

    const timer = window.setTimeout(() => setMessage(null), duration)
    return () => window.clearTimeout(timer)
  }, [duration, message])

  return {
    message,
    showToast: setMessage,
    dismissToast: () => setMessage(null),
  }
}
