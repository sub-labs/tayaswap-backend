import type { AppContext } from '@/types'

export function success() {}

export function error(context: AppContext, error: string) {
  return context.json({ success: false, error })
}
