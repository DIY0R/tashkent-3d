import type { ReactNode } from 'react'
import { useStore, type Language } from '@/state/store'
import { saveSettings } from './uiStore'

export function Key({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <kbd className={`tk-key ${className}`}>{children}</kbd>
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="tk-switch" onClick={() => onChange(!checked)} />
}

export function setLanguage(l: Language) {
  useStore.getState().setLanguage(l)
  saveSettings()
}
