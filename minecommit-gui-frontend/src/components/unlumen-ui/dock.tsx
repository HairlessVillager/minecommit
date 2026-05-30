"use client"

import * as React from "react"
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  type SpringOptions,
  AnimatePresence,
} from "motion/react"

import { cn } from "@/lib/utils"

export interface DockItem {
  icon: React.ReactNode
  label: string
  /** if provided, item renders as an `<a>` */
  href?: string
  onClick?: () => void
  /** renders a visual separator after this item */
  separator?: boolean
}

export interface DockProps {
  items: DockItem[]
  /** @default 1.8 */
  magnification?: number
  /** cursor radius (px) within which neighbors are magnified — @default 120 */
  distance?: number
  /** @default 40 */
  iconSize?: number
  /** @default 4 */
  gap?: number
  /** @default 16 */
  borderRadius?: number
  /** show labels permanently instead of on hover — @default false */
  alwaysShowLabels?: boolean
  springOptions?: SpringOptions
  className?: string
}

const DEFAULT_SPRING: SpringOptions = {
  stiffness: 400,
  damping: 25,
  mass: 0.4,
}

function DockSeparator() {
  return (
    <div className="mx-1 flex items-center self-stretch">
      <div className="h-6 w-px bg-foreground/10" />
    </div>
  )
}

function DockIcon({
  item,
  mouseX,
  magnification,
  distance,
  iconSize,
  borderRadius,
  alwaysShowLabels,
  springOptions,
  onHover,
  iconIndex,
  iconRef,
}: {
  item: DockItem
  mouseX: ReturnType<typeof useMotionValue<number>>
  magnification: number
  distance: number
  iconSize: number
  borderRadius: number
  alwaysShowLabels: boolean
  springOptions: SpringOptions
  onHover: (index: number | null) => void
  iconIndex: number
  iconRef: React.Ref<HTMLDivElement>
}) {
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  const gaussian = (d: number) =>
    (magnification - 1) * Math.exp(-(d * d) / (2 * distance * distance)) + 1

  const width = useSpring(iconSize, springOptions)
  const height = useSpring(iconSize, springOptions)

  // Compute magnification imperatively from mouse position, avoiding
  // ref access inside useTransform (which triggers a React warning).
  useMotionValueEvent(mouseX, "change", (val) => {
    const el = wrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dist = Math.abs(val - (rect.left + rect.width / 2))
    const size = iconSize * gaussian(dist)
    width.set(size)
    height.set(size)
  })

  const Tag = item.href ? "a" : "button"

  return (
    // fixed height in-flow; width animates to push neighbors
    <motion.div
      ref={wrapperRef}
      className="relative flex items-end justify-center"
      style={{ width, height: iconSize }}
    >
      {/* absolute, anchored bottom so icon grows upward */}
      <motion.div
        ref={iconRef}
        style={{ width, height, bottom: 0 }}
        className="absolute"
      >
        <Tag
          href={item.href}
          onClick={item.onClick}
          onMouseEnter={() => onHover(iconIndex)}
          onMouseLeave={() => onHover(null)}
          aria-label={item.label}
          style={{ borderRadius }}
          className={cn(
            "flex h-full w-full items-center justify-center",
            "text-foreground/70 transition-colors duration-150",
            "hover:bg-foreground/6 hover:text-foreground",
            "focus-visible:ring-1 focus-visible:ring-foreground/20 focus-visible:outline-none",
            "[&_svg]:size-[55%]"
          )}
        >
          {item.icon}
        </Tag>
      </motion.div>

      {alwaysShowLabels && (
        <span className="pointer-events-none mt-0.5 text-[10px] leading-none font-medium tracking-tight whitespace-nowrap text-foreground/40 select-none">
          {item.label}
        </span>
      )}
    </motion.div>
  )
}

export function Dock({
  items,
  magnification = 1.8,
  distance = 120,
  iconSize = 40,
  gap = 4,
  borderRadius = 16,
  alwaysShowLabels = false,
  springOptions = DEFAULT_SPRING,
  className,
}: DockProps) {
  const mouseX = useMotionValue(Infinity)
  const dockRef = React.useRef<HTMLDivElement>(null)

  // Store icon DOM elements in a ref-backed Map (not a React ref to elements).
  // Callback refs populate it during commit; effects and animation callbacks read it.
  const iconMap = React.useRef(new Map<number, HTMLDivElement>())
  const setIconRef = (index: number) => (el: HTMLDivElement | null) => {
    if (el) iconMap.current.set(index, el)
    else iconMap.current.delete(index)
  }

  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)
  const [tooltipX, setTooltipX] = React.useState(0)
  const [tooltipBottomOffset, setTooltipBottomOffset] = React.useState(0)

  React.useEffect(() => {
    if (hoveredIndex === null) return

    let raf: number
    const update = () => {
      const iconEl = iconMap.current.get(hoveredIndex!)
      const dockEl = dockRef.current
      if (iconEl && dockEl) {
        const iconRect = iconEl.getBoundingClientRect()
        const dockRect = dockEl.getBoundingClientRect()
        setTooltipX(iconRect.left - dockRect.left + iconRect.width / 2)
        setTooltipBottomOffset(dockRect.bottom - iconRect.top)
      }
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [hoveredIndex])

  const handleHover = React.useCallback((index: number | null) => {
    setHoveredIndex(index)
  }, [])

  return (
    <motion.div
      ref={dockRef}
      className={cn(
        "relative flex items-end overflow-visible border border-foreground/8 bg-background/80 px-2 py-2 shadow-none backdrop-blur-xl transition-shadow duration-200 hover:shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_2px_8px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]",
        className
      )}
      style={{ gap, borderRadius }}
      onMouseMove={(e) => mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
          <DockIcon
            item={item}
            mouseX={mouseX}
            magnification={magnification}
            distance={distance}
            iconSize={iconSize}
            borderRadius={borderRadius}
            alwaysShowLabels={alwaysShowLabels}
            springOptions={springOptions}
            onHover={handleHover}
            iconIndex={i}
            iconRef={setIconRef(i)}
          />
          {item.separator && <DockSeparator />}
        </React.Fragment>
      ))}

      {!alwaysShowLabels && (
        <AnimatePresence>
          {hoveredIndex !== null && (
            <motion.div
              key="dock-tooltip"
              layoutId="dock-tooltip"
              className="pointer-events-none absolute z-50 flex flex-col items-center"
              style={{
                left: tooltipX,
                bottom: tooltipBottomOffset + 8,
                x: "-50%",
              }}
              initial={{ opacity: 0, y: 6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.94 }}
              transition={{ duration: 0.13, ease: "easeOut" }}
            >
              <span className="rounded-md border border-foreground/10 bg-background px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground shadow-sm">
                {items[hoveredIndex].label}
              </span>
              <svg
                width="8"
                height="4"
                viewBox="0 0 8 4"
                className="-mt-px text-background"
                aria-hidden
              >
                <path d="M0 0L4 4L8 0" fill="currentColor" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  )
}
