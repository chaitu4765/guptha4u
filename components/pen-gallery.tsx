import * as React from "react"
import { createRoot } from "react-dom/client"
import { AddPen, PenDiscount, PenPhoto, PenProductShelf, Prices, SavePen, type Pen } from "@/components/ui/pen-product-shelf"

type Gallery = { title: string; items: Pen[]; kind: string }

const compact = matchMedia("(max-width: 680px)")
const reduced = matchMedia("(prefers-reduced-motion: reduce)")

type Flight = { layer: HTMLElement; animation: Animation }

function flyPen(from: DOMRect, target: HTMLElement, photo: Element, done: () => void, settlePhoto?: Element): Flight | null {
  if (reduced.matches || !HTMLElement.prototype.showPopover) return null
  const to = target.getBoundingClientRect()
  if (!from.width || !to.width) return null
  const layer = document.createElement("div")
  layer.className = "pen-flight"
  layer.setAttribute("popover", "manual")
  layer.setAttribute("aria-hidden", "true")
  Object.assign(layer.style, {
    left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`,
  })
  layer.append(photo.cloneNode(true))
  document.body.append(layer)
  layer.showPopover()
  const duration = 570
  if (settlePhoto) {
    const arrival = settlePhoto.cloneNode(true) as HTMLElement
    layer.append(arrival)
    arrival.animate([{ opacity: 0 }, { opacity: 0, offset: .63 }, { opacity: 1 }], { duration, fill: "both" })
    layer.firstElementChild?.animate([{ opacity: 1 }, { opacity: 1, offset: .63 }, { opacity: 0 }], { duration, fill: "both" })
  }
  const dx = from.x + from.width / 2 - to.x - to.width / 2
  const dy = from.y + from.height / 2 - to.y - to.height / 2
  const scale = from.width / to.width
  const animation = layer.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    { transform: `translate(${dx * .42}px, ${dy * .42 - 22}px) scale(${(scale + 1) / 2})`, offset: .52 },
    { transform: "none" },
  ], { duration, easing: "cubic-bezier(.24,.72,.26,1)", fill: "forwards" })
  animation.onfinish = () => {
    done()
    requestAnimationFrame(() => layer.remove())
  }
  return { layer, animation }
}

function PenInspector({ pen, title, origin, onClose }: {
  pen: Pen
  title: string
  origin: HTMLElement | null
  onClose: () => void
}) {
  const [angle, setAngle] = React.useState(0)
  const dialog = React.useRef<HTMLDialogElement>(null)
  const figure = React.useRef<HTMLDivElement>(null)
  const start = React.useRef<number | null>(null)
  const closing = React.useRef(false)
  const flight = React.useRef<Flight | null>(null)

  function cancelFlight() {
    const current = flight.current
    if (!current) return
    current.animation.onfinish = null
    current.animation.cancel()
    current.layer.remove()
    flight.current = null
  }

  React.useLayoutEffect(() => {
    const panel = dialog.current
    if (!panel) return
    panel.showModal()
    const target = figure.current
    const photo = origin?.querySelector(".pen-photo")
    if (origin && target && photo) {
      flight.current = flyPen(origin.getBoundingClientRect(), target, photo, () => {
        flight.current = null
        target.removeAttribute("data-flying")
      })
      if (flight.current) target.setAttribute("data-flying", "")
    }
    document.dispatchEvent(new Event("storefront:navigated"))
    return () => { cancelFlight(); panel.close() }
  }, [])

  function close() {
    if (closing.current) return
    closing.current = true
    const source = flight.current?.layer ?? figure.current
    const photo = source?.querySelector(".pen-photo")
    const from = source?.getBoundingClientRect()
    cancelFlight()
    dialog.current?.setAttribute("data-closing", "")
    if (from && photo && origin) {
      const railPhoto = origin.querySelector(".pen-photo")
      flight.current = flyPen(from, origin, photo, () => {
        flight.current = null
        onClose()
      }, angle > 0 ? railPhoto ?? undefined : undefined)
    }
    if (flight.current) figure.current?.setAttribute("data-flying", "")
    else onClose()
  }

  function turn() {
    setAngle(current => (current + 1) % pen.views.length)
  }

  const canTurn = pen.views.length > 1
  return <dialog ref={dialog} className="pen-inspector" aria-labelledby="inspected-pen"
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === event.currentTarget) close() }}
    onKeyDown={event => {
      if (canTurn && !(event.target instanceof HTMLInputElement) && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault()
        turn()
      }
    }}>
    <div className="pen-inspector-grid">
      <div className="pen-inspector-stage">
        <PenDiscount discount={pen.discount} />
        <SavePen pen={pen} />
        <div className="pen-inspector-figure" ref={figure} data-rotatable={canTurn}
          onPointerDown={event => {
            if (!canTurn) return
            start.current = event.clientX
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerUp={event => {
            if (start.current !== null && Math.abs(event.clientX - start.current) > 25) turn()
            start.current = null
          }}
          onPointerCancel={() => { start.current = null }}>
          <PenPhoto key={angle} view={pen.views[angle]} name={pen.name} detail />
        </div>
        {canTurn && <div className="pen-angles" role="group" aria-label="Pen views">
          {pen.views.map((view, index) => <button type="button" key={view.label}
            aria-pressed={angle === index} onClick={() => setAngle(index)}>{view.label}</button>)}
        </div>}
      </div>
      <div className="pen-inspector-copy">
        <button type="button" className="pen-close" onClick={close} autoFocus>← Back to pens</button>
        <p className="pen-collection-name">{title}</p>
        <h2 id="inspected-pen">{pen.name}</h2>
        <p>{pen.description}</p>
        <Prices pen={pen} />
        <div className="stationery-detail-actions">
          <AddPen pen={pen} quantity />
        </div>
      </div>
    </div>
  </dialog>
}

function PenGallery({ title, items, kind }: Gallery) {
  const railPens = items.filter(pen => pen.onRail)
  const shelfPens = kind ? items.filter(pen => pen.type === kind) : items
  const itemsOnRail = railPens.length
  const [active, setActive] = React.useState(Math.floor((itemsOnRail - 1) / 2))
  const [open, setOpen] = React.useState<{ pen: Pen; button: HTMLButtonElement } | null>(null)
  const buttons = React.useRef<Array<HTMLButtonElement | null>>([])
  const rail = React.useRef<HTMLDivElement>(null)
  const dragX = React.useRef(0)
  const dragged = React.useRef(false)

  function focus(index: number) {
    const next = (index + itemsOnRail) % itemsOnRail
    const button = buttons.current[next]
    button?.focus({ preventScroll: true })
    if (compact.matches) button?.scrollIntoView({
      behavior: reduced.matches ? "instant" : "smooth", block: "nearest", inline: "center",
    })
    setActive(next)
  }

  function centreItem() {
    const scroller = rail.current
    if (!compact.matches || !scroller) return
    const rect = scroller.getBoundingClientRect()
    const centre = rect.left + rect.width / 2
    let nearest = 0
    let distance = Infinity
    buttons.current.forEach((button, index) => {
      if (!button) return
      const bounds = button.getBoundingClientRect()
      const offset = Math.abs(bounds.left + bounds.width / 2 - centre)
      if (offset < distance) { nearest = index; distance = offset }
    })
    setActive(nearest)
  }

  React.useLayoutEffect(() => {
    document.dispatchEvent(new Event("storefront:navigated"))
    const scroller = rail.current
    const first = buttons.current[active]
    if (!compact.matches || !scroller || !first) return
    const item = first.getBoundingClientRect()
    const bounds = scroller.getBoundingClientRect()
    scroller.scrollLeft += item.left - bounds.left + (item.width - bounds.width) / 2
  }, [])

  const selected = railPens[active]
  const origin = open?.button.querySelector<HTMLElement>(".pen-rail-figure, .pen-shelf-figure")
  return <>
  <section className="pen-gallery" aria-label={title}>
    <a className="button outline pen-gallery-back" href="/shop/stationery">← All stationery</a>
    <h1>{title}</h1>
    <div className="pen-rail" ref={rail} onScroll={centreItem} aria-label="Choose a pen"
      onPointerDown={event => { dragX.current = event.clientX; dragged.current = false }}
      onPointerMove={event => {
        if (event.pointerType !== "mouse" || event.buttons !== 1 || compact.matches) return
        const distance = event.clientX - dragX.current
        if (Math.abs(distance) < 45) return
        dragX.current = event.clientX
        dragged.current = true
        setActive(index => Math.min(itemsOnRail - 1, Math.max(0, index + Math.sign(distance))))
      }}
      onClickCapture={event => {
        if (!dragged.current || event.detail === 0) return
        dragged.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
        event.preventDefault()
        if (event.key === "Home") focus(0)
        else if (event.key === "End") focus(itemsOnRail - 1)
        else focus(active + (event.key === "ArrowRight" ? 1 : -1))
      }}>
      {railPens.map((pen, index) => <button className="pen-rail-item" key={pen.id} type="button"
        ref={element => { buttons.current[index] = element }}
        data-active={active === index} data-lifted={open !== null && open.button === buttons.current[index]}
        data-position={index < active ? "before" : "after"}
        aria-label={`Inspect ${pen.name}`} aria-haspopup="dialog"
        tabIndex={active === index ? 0 : -1}
        onPointerEnter={event => { if (event.pointerType === "mouse" && event.buttons === 0 && !compact.matches) setActive(index) }}
        onFocus={() => setActive(index)}
        onClick={event => { setActive(index); setOpen({ pen, button: event.currentTarget }) }}>
        <span className="pen-rail-figure"><PenPhoto view={pen.views[0]} name="" /></span>
        <span className="pen-rail-lamp" aria-hidden="true"><img src="/storefront/stationery/pendant.webp" alt="" /></span>
        <span className="pen-rest" aria-hidden="true" />
      </button>)}
    </div>
    {selected && <div className="pen-gallery-caption" aria-live="polite">
      <p>{selected.name}</p><Prices pen={selected} /><PenDiscount discount={selected.discount} />
    </div>}
  </section>
    <PenProductShelf pens={shelfPens} heading={kind || "Shop the collection"}
      lifted={open?.button.classList.contains("pen-shelf-preview") ? open.pen.id : undefined}
      inspect={(pen, button) => setOpen({ pen, button })} />
    {open && <PenInspector pen={open.pen} title={title} origin={origin ?? null}
      onClose={() => {
        const button = open.button
        setOpen(null)
        requestAnimationFrame(() => button?.focus({ preventScroll: true }))
      }} />}
  </>
}

const mount = document.querySelector("[data-pen-gallery]")
const data = document.querySelector("#pen-gallery-data")
if (mount && data?.textContent) {
  const props: Gallery = JSON.parse(data.textContent)
  if (props.items.length) createRoot(mount).render(<PenGallery {...props} />)
}
