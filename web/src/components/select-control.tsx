import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export function SelectControl<Value extends string>({
  value,
  onChange,
  options,
  label,
  id,
  className,
  disabled = false,
  size = 'default',
}: {
  value: Value | null
  onChange: (value: Value) => void
  options: readonly { value: Value; label: string }[]
  label: string
  id?: string
  className?: string
  disabled?: boolean
  size?: 'default' | 'sm'
}) {
  return (
    <Select<Value>
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
      items={options}
    >
      <SelectTrigger
        id={id}
        disabled={disabled}
        size={size}
        aria-label={label}
        className={cn('w-full', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent sideOffset={6} alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
