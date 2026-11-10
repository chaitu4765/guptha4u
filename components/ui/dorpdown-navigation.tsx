import { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Frame, Notebook, PaintBucket, Paintbrush, Pencil, Presentation, Scissors, Tag } from "lucide-react"

type Link = { label: string; href: string }
type Group = Link & { items: Link[] }
export type NavItem = Link & { id: string; subMenus: Group[] }

const icons = {
  paints: PaintBucket, brushes: Paintbrush, canvas: Frame, easels: Presentation,
  drawing: Pencil, papers: Notebook, accessories: Scissors, brands: Tag,
}
const drawingColumns = [
  ["Charcoal & Graphite", "Calligraphy"], ["Markers"], ["Pencils", "Pens", "Erasers & Sharpeners"], ["Pastel", "Inks"],
]

export function DropdownNavigation({ navItems }: { navItems: NavItem[] }) {
  const [open, setOpen] = useState<{ id: string; center: number } | null>(null)
  const menu = navItems.find(item => item.id === open?.id)
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const focusLink = useRef(false)
  const triggers = useRef(new Map<string, HTMLButtonElement>())
  const panelId = useId()
  const reduced = useReducedMotion()
  const transition = { duration: reduced ? 0 : .24, ease: [.22, 1, .36, 1] as const }

  function reveal(id: string, trigger: HTMLButtonElement, keyboard = false) {
    if (!root.current) return
    if (open?.id === id && keyboard) {
      panel.current?.querySelector<HTMLAnchorElement>("a")?.focus()
      return
    }
    focusLink.current = keyboard
    const rect = trigger.getBoundingClientRect()
    setOpen({ id, center: rect.left + rect.width / 2 - root.current.getBoundingClientRect().left })
  }

  useEffect(() => {
    if (open && focusLink.current) {
      panel.current?.querySelector<HTMLAnchorElement>("a")?.focus()
      focusLink.current = false
    }
  }, [open])

  useEffect(() => {
    const close = () => setOpen(null)
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close()
    }
    document.addEventListener("pointerdown", outside)
    document.addEventListener("storefront:navigated", close)
    return () => {
      document.removeEventListener("pointerdown", outside)
      document.removeEventListener("storefront:navigated", close)
    }
  }, [])

  const grouped = menu?.subMenus.some(group => group.items.length)
  const columns: Group[][] = grouped ? [[], [], [], []] : [[]]
  menu?.subMenus.forEach((group, index) => {
    const drawing = menu.id === "drawing" ? drawingColumns.findIndex(names => names.includes(group.label)) : -1
    columns[drawing < 0 ? index % columns.length : drawing].push(group)
  })
  const Icon = menu ? icons[menu.id as keyof typeof icons] ?? Tag : Tag
  return (
    <div className="animated-navigation" ref={root}
      onPointerLeave={event => {
        if (event.pointerType === "mouse" && !panel.current?.contains(document.activeElement)) setOpen(null)
      }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null)
      }}
      onKeyDown={event => {
        if (event.key !== "Escape" || !open) return
        event.preventDefault()
        triggers.current.get(open.id)?.focus()
        setOpen(null)
      }}>
      <LayoutGroup>
        <ul className="animated-navigation-list">
          {navItems.map(item => (
            <li key={item.id}>
              {item.subMenus.length ? (
                <button className="animated-nav-trigger" type="button" aria-expanded={open?.id === item.id}
                  aria-controls={open?.id === item.id ? panelId + "-" + item.id : undefined}
                  ref={element => {
                    if (element) triggers.current.set(item.id, element)
                    else triggers.current.delete(item.id)
                  }}
                  onPointerEnter={event => {
                    if (event.pointerType === "mouse" && !panel.current?.contains(document.activeElement)) {
                      reveal(item.id, event.currentTarget)
                    }
                  }}
                  onClick={event => {
                    const touch = event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === "touch"
                    if (open?.id === item.id && (touch || event.detail === 0)) {
                      setOpen(null)
                    } else reveal(item.id, event.currentTarget, event.detail === 0)
                  }}
                  onKeyDown={event => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault()
                      reveal(item.id, event.currentTarget, true)
                    }
                  }}>
                  {open?.id === item.id && <motion.span className="animated-nav-pill" layoutId={reduced ? undefined : "category-pill"} transition={transition} />}
                  <span>{item.label}</span><ChevronDown aria-hidden="true" size={13} />
                </button>
              ) : <a className="animated-nav-trigger" href={item.href} data-studio-link>{item.label}</a>}
            </li>
          ))}
        </ul>
        <AnimatePresence>
          {menu && open && (
            <motion.div key={menu.id} id={panelId + "-" + menu.id} ref={panel}
              className={`animated-nav-panel ${grouped ? "is-grouped" : "is-flat"}`}
              style={{ "--dropdown-center": `${open.center}px` } as React.CSSProperties}
              initial={reduced ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4, pointerEvents: "none" }}
              layoutId={reduced ? undefined : "category-panel"} transition={transition}>
              {columns.filter(column => column.length).map((column, index) => (
                <div className="animated-nav-column" key={index}>{column.map(group => (
                <div className="animated-nav-group" key={group.href}>
                  <a className="animated-nav-group-link" href={group.href} data-studio-link>
                    <span className="animated-nav-icon"><Icon aria-hidden="true" size={16} /></span>
                    {group.label}
                  </a>
                  {group.items.length > 0 && <ul>
                    {group.items.map(item => <li key={item.href}>
                      <a className="animated-nav-leaf" href={item.href} data-studio-link>{item.label}</a>
                    </li>)}
                  </ul>}
                </div>
                ))}</div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
