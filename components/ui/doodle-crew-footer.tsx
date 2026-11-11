"use client"

import { useEffect, useId, useRef, useState } from "react"
import type { CSSProperties } from "react"

const groups = [
  { title: "Paint & make", items: [["Paints & Mediums", "category/paints"], ["Brushes & Painting Tools", "category/brushes"], ["Canvas", "category/canvas"], ["Easels", "category/easels"]] },
  { title: "Draw & design", items: [["Drawing & Illustration", "category/drawing"], ["Papers & Pads", "category/papers"], ["Accessories", "category/accessories"], ["Brands", "category/brands"]] },
  { title: "The store", items: [["Browse catalogue", "catalogue"], ["Open wishlist", "wishlist"], ["View cart", "cart"], ["About this demo", "about"]] },
]

// The supplied footer's yeti, bird, mushroom, ghost and cat, placed on GUPTA.
const crew = [
  { name: "Bruno", says: "Make a little mess.", x: 51, y: 4, scale: .78, eyes: [[-15, -86], [13, -88]], top: -140, width: 110,
    art: <><path d="M-30-104C-40-112-44-124-40-138L-13-114ZM18-114C26-124 36-130 47-133L32-101Z"/><path d="M-44-2C-54-28-54-66-42-90C-32-110-14-118 2-118C22-118 40-108 48-88C58-64 58-28 48-2C30 4-26 4-44-2Z"/><path className="dcf-inkline" d="M-12-70Q0-61 12-71M-18-102L-9-99M5-99L18-101"/><path className="dcf-accent" d="M-43-58Q0-34 50-27L48-18Q0-22-45-47Z"/></> },
  { name: "Pip", says: "One more stroke.", x: 260, y: -114, scale: 1.05, eyes: [[3, -30], [12, -31]], top: -65, width: 70,
    art: <><path className="dcf-inkline" d="M-6 2V-8M-11 2H-2M6 2V-8M1 2H11"/><path d="M-17-16Q-31-18-32-9L-14-10C-28-37 7-52 18-29C30-4-6 7-17-16Z"/><path className="dcf-accent" d="M19-30L29-27L19-23ZM-5-38L4-59L12-37Z"/><path className="dcf-inkline" d="M-11-23Q3-25-4-12Q-15-12-11-23Z"/></> },
  { name: "Morel", says: "Good things grow from a sketch.", x: 350, y: 5, scale: .92, eyes: [[-4.5, -16], [4.5, -16]], top: -57, width: 56,
    art: <><path d="M-10 0Q-10-12-8-28H8Q10-12 10 0Q0 7-10 0Z"/><path className="dcf-accent" d="M-25-28C-27-45-12-55 0-55C12-55 27-45 25-28C14-23-14-23-25-28Z"/><circle cx="-12" cy="-40" r="3.4"/><circle cx="7" cy="-46" r="3"/><path className="dcf-inkline" d="M-3-10Q0-6 3-10"/></> },
  { name: "Boo", says: "Start with a blank page.", x: 504, y: -114, scale: .95, eyes: [[-8, -44], [9, -44]], top: -70, width: 54,
    art: <><path d="M-23-14V-40C-23-59-12-67 0-67C12-67 23-59 23-40V-14C12-10-12-10-23-14Z"/><path className="dcf-inkline" d="M-6-34Q0-26 6-34M-16-29L-11-31M12-31L17-29"/></> },
  { name: "Patch", says: "Save a colour for later.", x: 655, y: 5, scale: .8, eyes: [[10, -76]], top: -111, width: 96,
    art: <><path d="M19-4C44-4 54-27 43-45Q36-52 33-44C41-25 32-17 17-14Z"/><path d="M-22 0C-28-18-24-42-14-52H14C24-42 28-18 22 0Q0 6-22 0Z"/><path d="M-22-86L-25-107L-7-96L8-96L23-108L22-86C37-68 19-50 0-50C-19-50-35-69-22-86Z"/><path className="dcf-accent" d="M-18-54Q0-48 18-54V-47Q0-39-17-46Z"/><ellipse className="dcf-solid" cx="-10" cy="-76" rx="6.5" ry="5.5"/><path className="dcf-inkline" d="M-25-82Q0-85 25-93M-5-64Q0-59 5-64M-9-23V0M9-23V0"/></> },
]
const shapes = [
  "M0-11 3-3 11-3 5 2 7 10 0 5-7 10-5 2-11-3-3-3Z",
  "M0 9C-13 1-13-10-6-10Q-2-10 0-6Q2-10 6-10C13-10 13 1 0 9Z",
  "M0-12C2-3 4-2 12 0C4 2 2 4 0 12C-2 4-4 2-12 0C-4-2-2-3 0-12Z",
]

export default function DoodleCrewFooter({ demoCheckout = false }: { demoCheckout?: boolean }) {
  const root = useRef<HTMLElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const pointer = useRef<DOMPoint | null>(null)
  const timer = useRef(0)
  const [visible, setVisible] = useState(false)
  const [entered, setEntered] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [speaker, setSpeaker] = useState<(typeof crew)[number] | null>(null)
  const id = useId().replace(/[^a-z0-9-]/gi, "") + "-ink"
  const moving = visible && !paused && !reduced

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(media.matches)
    media.addEventListener("change", update)
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting)
      if (entry.isIntersecting) setEntered(true)
    })
    if (root.current) observer.observe(root.current)
    return () => {
      observer.disconnect()
      media.removeEventListener("change", update)
      clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    const scene = svg.current
    if (!scene) return
    const pupils = [...scene.querySelectorAll<SVGCircleElement>(".dcf-pupil")]
    const floaters = [...scene.querySelectorAll<SVGGElement>(".dcf-floater")]
    if (!moving) {
      pupils.forEach(pupil => { pupil.removeAttribute("transform"); pupil.style.opacity = "1" })
      return
    }
    let frame = 0
    const start = performance.now()
    const animate = (now: number) => {
      const matrix = scene.getScreenCTM()
      const target = pointer.current && matrix ? pointer.current.matrixTransform(matrix.inverse()) : null
      pupils.forEach((pupil, index) => {
        if (target) {
          const origin = (pupil.parentNode as SVGGElement | null)?.getScreenCTM()
          const eye = origin && pointer.current?.matrixTransform(origin.inverse())
          if (eye) {
            const x = eye.x - pupil.cx.baseVal.value, y = eye.y - pupil.cy.baseVal.value
            const factor = 2.3 / Math.max(12, Math.hypot(x, y))
            pupil.setAttribute("transform", "translate(" + x * factor + " " + y * factor + ")")
          }
        } else pupil.removeAttribute("transform")
        pupil.style.opacity = (now + index * 400) % 5300 < 115 ? "0" : "1"
      })
      floaters.forEach((floater, index) => {
        let x = 52 + index * 82 + Math.sin(now / 1150 + index * 2) * 17
        let y = -239 + ((now - start) * (.014 + index * .001) + index * 37) % 258
        if (target) {
          const dx = x - target.x, dy = y - target.y
          const push = Math.max(0, 1 - Math.hypot(dx, dy) / 75) * .7
          x += dx * push
          y += dy * push
        }
        floater.setAttribute("transform", "translate(" + x + " " + y + ")")
      })
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [moving])

  function speak(member: (typeof crew)[number]) {
    setSpeaker(member)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSpeaker(null), 2700)
  }

  return <footer ref={root} className="dcf" data-entered={entered} data-moving={moving}
    onPointerMove={event => { pointer.current = new DOMPoint(event.clientX, event.clientY) }}
    onPointerLeave={() => { pointer.current = null }}>
    <div className="wrap dcf-top">
      <div><a className="wordmark" href="/shop"><span>Gupta</span><small>Art Store and Stationary</small></a>
        <p>Art materials and stationery for your workbench.</p></div>
      <nav aria-label="Footer links">{groups.map(group => <div key={group.title}>
        <h2>{group.title}</h2>
        <ul>{group.items.map(([label, route]) => <li key={route}><a href={"/shop/" + route}>{label}</a></li>)}
          {demoCheckout && group.title === "The store" && <li><a href="/shop/privilege">Privilege membership</a></li>}
        </ul>
      </div>)}</nav>
    </div>
    <div className="wrap dcf-world">
      <svg ref={svg} className="dcf-drawing" viewBox="0 -205 720 229" role="group" aria-label="Gupta sketchbook crew">
        <defs><filter id={id} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="11" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
        </filter></defs>
        <path className="dcf-ground" pathLength="1" d="M12 7Q47 3 79 8T146 6T216 8T285 5T354 7T425 6T494 8T563 6T633 8T708 6"/>
        {Array.from("GUPTA", (letter, index) => <g key={letter} className="dcf-letter"
          style={{ "--delay": 150 + index * 95 + "ms" } as CSSProperties}>
          <text x={48 + index * 126} y="0" textLength="121" lengthAdjust="spacingAndGlyphs" filter={"url(#" + id + ")"}>{letter}</text>
        </g>)}
        {Array.from({ length: 8 }, (_, index) => <g className="dcf-floater" key={index}
          transform={"translate(" + (42 + index * 90) + " " + (-188 + index % 3 * 22) + ")"} aria-hidden="true"
          onPointerDown={event => {
            if (moving) event.currentTarget.animate([{ opacity: 1 }, { opacity: 0, offset: .23 }, { opacity: 1 }], 1200)
          }}>
          <path d={shapes[index % shapes.length]} />
        </g>)}
        {crew.map((member, index) => <g key={member.name}
          transform={"translate(" + member.x + " " + member.y + ") scale(" + member.scale + ")"}>
          <g className="dcf-arrive" style={{ "--delay": 650 + index * 110 + "ms" } as CSSProperties}>
            <g className={"dcf-character" + (speaker === member ? " is-speaking" : "")}>{member.art}
              {member.eyes.map(([x, y]) => <g key={x}><circle cx={x} cy={y} r="5.2"/>
                <circle className="dcf-pupil dcf-solid" cx={x} cy={y} r="2.2"/></g>)}
            </g>
          </g>
          <rect className="dcf-hit" x={-member.width / 2} y={member.top} width={member.width} height={-member.top + 8}
            rx="10" role="button" tabIndex={0} aria-label={"Say hello to " + member.name} onClick={() => speak(member)}
            onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); speak(member) } }}/>
        </g>)}
      </svg>
      <p className="dcf-speech" role="status">{speaker ? speaker.says : ""}</p>
      <div className="dcf-cta">
        <p>Make something with Gupta.</p>
        <div><a className="button" href="/shop/catalogue">Browse materials</a>
          <a className="button outline" href="/shop/wishlist">Open wishlist</a></div>
      </div>
    </div>
    <div className="wrap dcf-bar">
      <small>© {new Date().getFullYear()} Gupta Art Store and Stationary</small>
      <a className="button outline button--small" href="/shop/privacy">Privacy</a>
      {!reduced && <button className="button outline button--small" type="button" onClick={() => setPaused(value => !value)}>
        {paused ? "Play animation" : "Pause animation"}
      </button>}
      <button className="button outline button--small" type="button" onClick={() => {
        if (document.dispatchEvent(new Event("storefront:top", { cancelable: true }))) {
          window.scrollTo({ top: 0, behavior: reduced ? "instant" : "smooth" })
        }
      }}>Back to top ↑</button>
    </div>
  </footer>
}
