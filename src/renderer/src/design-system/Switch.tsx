import * as RadixSwitch from '@radix-ui/react-switch'

interface Props {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export const Switch = ({
  label,
  checked,
  onCheckedChange,
  disabled
}: Props): React.ReactElement => (
  <RadixSwitch.Root
    checked={checked}
    onCheckedChange={onCheckedChange}
    disabled={disabled}
    className="group flex w-full items-center gap-3"
  >
    <span className="text-sm text-[var(--color-text-1)]">{label}</span>
    <span
      dir="ltr"
      className={`relative ms-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-[var(--duration-fast)] ${
        checked
          ? 'border-transparent bg-[var(--color-accent-solid)]'
          : 'border-[var(--color-border-strong)] bg-[var(--color-bg-3)]'
      } ${disabled ? 'opacity-50' : 'group-hover:border-[var(--color-border-strong)]'}`}
    >
      <span
        className={`mx-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-fast)] ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </span>
  </RadixSwitch.Root>
)
