import * as RadixSwitch from '@radix-ui/react-switch'

interface Props {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export const Switch = ({ label, checked, onCheckedChange, disabled }: Props): React.ReactElement => (
  <RadixSwitch.Root
    checked={checked}
    onCheckedChange={onCheckedChange}
    disabled={disabled}
    className="flex items-center gap-3"
  >
    <span className="text-sm text-[var(--color-text-1)]">{label}</span>
    <span
      className={`relative ml-auto inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-bg-3)]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </span>
  </RadixSwitch.Root>
)
