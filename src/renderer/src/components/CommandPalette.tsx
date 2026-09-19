import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { Modal } from '../design-system/Modal'
import { useSessionStore } from '../stores/sessionStore'
import { useThemeStore } from '../stores/themeStore'

export interface PaletteCommand {
  id: string
  label: string
  hint?: string
  keywords?: string
  run: () => void | Promise<void>
}

/**
 * Global command palette — Ctrl/⌘+K opens; ↑/↓ navigate; Enter runs; Esc closes.
 * Commands are fuzzy-matched on label + keywords. Registered once per mount.
 */
export const CommandPalette = (): React.ReactElement | null => {
  const navigate = useNavigate()
  const { session, lock } = useSessionStore()
  const { theme, setTheme } = useThemeStore()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (to: string) => () => navigate(to)
    const can = (p: string): boolean => Boolean(session?.permissions.includes(p))
    const list: PaletteCommand[] = []

    if (can('reports.view'))
      list.push({
        id: 'go-dashboard',
        label: 'Go to Dashboard',
        hint: '/',
        keywords: 'home sales view',
        run: go('/dashboard')
      })
    if (can('sales.create'))
      list.push({
        id: 'go-pos',
        label: 'Go to POS',
        hint: '/',
        keywords: 'sale sell checkout cart',
        run: go('/pos')
      })
    if (can('inventory.view'))
      list.push({
        id: 'go-inventory',
        label: 'Go to Inventory',
        hint: '/',
        keywords: 'stock product',
        run: go('/inventory')
      })
    if (can('tables.view'))
      list.push({
        id: 'go-floor',
        label: 'Go to Floor Plan',
        hint: '/',
        keywords: 'restaurant table zone',
        run: go('/floor')
      })
    if (can('kitchen.view'))
      list.push({
        id: 'go-kitchen',
        label: 'Go to Kitchen Display',
        hint: '/',
        keywords: 'kds ticket cook',
        run: go('/kitchen')
      })
    if (can('customers.view'))
      list.push({
        id: 'go-customers',
        label: 'Go to Customers',
        hint: '/',
        keywords: 'loyalty client',
        run: go('/customers')
      })
    if (can('settings.manage'))
      list.push({
        id: 'go-settings',
        label: 'Go to Settings',
        hint: '/',
        keywords: 'config preference',
        run: go('/settings')
      })

    list.push({
      id: 'lock',
      label: 'Lock screen',
      keywords: 'security pin switch user',
      run: () => {
        lock()
        setOpen(false)
      }
    })
    list.push({
      id: 'theme-toggle',
      label: `Toggle theme (now ${theme})`,
      keywords: 'dark light system appearance',
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark')
    })
    return list
  }, [navigate, session, lock, theme, setTheme])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || (c.keywords?.toLowerCase().includes(q) ?? false)
    )
  }, [commands, query])

  const close = useCallback((): void => {
    setOpen(false)
    setQuery('')
    setIndex(0)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const runIndex = useCallback(
    async (i: number): Promise<void> => {
      const cmd = filtered[i]
      if (!cmd) return
      close()
      await cmd.run()
    },
    [filtered, close]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        void runIndex(index)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, index, close, runIndex])

  if (!open) return null

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) close()
      }}
      title="Command palette"
      width="xl"
    >
      <div className="p-3 -mt-2">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
          <Command size={15} className="text-[var(--color-text-2)]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-[var(--color-text-0)] placeholder:text-[var(--color-text-2)] focus:outline-none"
            aria-label="Command palette search"
          />
          <kbd className="rounded bg-[var(--color-bg-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-2)]">
            Ctrl K
          </kbd>
        </div>

        <ul className="mt-2 max-h-80 overflow-auto" role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <li className="p-4 text-center text-sm text-[var(--color-text-2)]">No matches</li>
          ) : (
            filtered.map((cmd, i) => (
              <li key={cmd.id}>
                <button
                  role="option"
                  aria-selected={i === index}
                  onClick={() => void runIndex(i)}
                  onMouseEnter={() => setIndex(i)}
                  className={`flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm ${
                    i === index
                      ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-1)]'
                  }`}
                >
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && (
                    <kbd className="rounded bg-[var(--color-bg-2)] px-1 text-[10px] text-[var(--color-text-2)]">
                      {cmd.hint}
                    </kbd>
                  )}
                  {i === index && <CornerDownLeft size={12} aria-hidden />}
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="mt-2 flex items-center gap-3 border-t border-[var(--color-border)] pt-2 text-[10px] text-[var(--color-text-2)]">
          <span className="flex items-center gap-1">
            <ArrowUp size={10} />
            <ArrowDown size={10} /> Navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft size={10} /> Run
          </span>
          <span className="flex items-center gap-1">Esc Close</span>
        </div>
      </div>
    </Modal>
  )
}
