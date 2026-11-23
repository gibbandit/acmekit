import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@/components/ui/cn'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const values = value ?? defaultValue ?? [min]
  const thumbs = Array.isArray(values) ? values : [values]

  return (
    <SliderPrimitive.Root
      className={cn(
        '[--thumb:var(--primary-foreground)] data-horizontal:w-full data-vertical:h-full',
        className,
      )}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-horizontal:min-h-11 md:data-horizontal:min-h-4 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-input/90 select-none data-horizontal:h-2 data-horizontal:w-full data-vertical:h-full data-vertical:w-2"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbs.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            className="block h-4 w-6 shrink-0 rounded-full border border-foreground/70 bg-(--thumb) control-surface transition-[color,background-color,border-color,box-shadow] motion-control select-none hover:ring-3 hover:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/30 data-disabled:shadow-none data-vertical:h-6 data-vertical:w-4"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
