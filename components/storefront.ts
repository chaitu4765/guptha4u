import { gsap } from "gsap"
import Lenis from "lenis"

const motion = matchMedia("(prefers-reduced-motion: no-preference)")
const fine = matchMedia("(hover: hover) and (pointer: fine)")
const compact = matchMedia("(max-width: 1000px)")
const duration = .38
const studioLifts = document.querySelector<HTMLElement>(".studio-lifts")
let lenis: Lenis | undefined
let studioLoading = false

function lift(item: HTMLElement, active: boolean) {
  const image = studioLifts?.querySelector(`[data-lift="${item.dataset.key}"]`)
  if (image) gsap.to(image, { scale: active ? 1.06 : 1, duration: .56, ease: "power3.out", overwrite: "auto" })
}

async function prepareStudio() {
  if (!studioLifts || studioLoading || compact.matches || !motion.matches) return
  studioLoading = true
  try {
    await Promise.all(Array.from(studioLifts.querySelectorAll("img"), image => {
      image.src = image.dataset.src!
      return image.decode()
    }))
    studioLifts.classList.add("is-ready")
    if (motion.matches && !compact.matches) {
      document.querySelectorAll<HTMLElement>('.studio-object').forEach(item => {
        if (item.matches(':focus-visible') || fine.matches && item.matches(':hover')) lift(item, true)
      })
    }
  } catch { /* The static panorama stays visible if a layer cannot load. */ }
}

function enter(element: Element | null) {
  if (!element || !motion.matches) return
  gsap.fromTo(element, { opacity: .55, y: 7 }, {
    opacity: 1, y: 0, duration: .62, ease: "power3.out", overwrite: "auto",
    clearProps: "opacity,transform"
  })
}

function scrollFrame(time: number) {
  lenis?.raf(time * 1000)
}

function scrollToTop(event: Event) {
  if (!motion.matches || !fine.matches || window.scrollY < 1) return
  event.preventDefault()
  lenis ??= new Lenis({ smoothWheel: false })
  gsap.ticker.add(scrollFrame)
  lenis.scrollTo(0, { duration: .65, onComplete: () => gsap.ticker.remove(scrollFrame) })
}

function syncPreferences() {
  if ((!motion.matches || !fine.matches) && lenis) {
    gsap.ticker.remove(scrollFrame)
    lenis.destroy()
    lenis = undefined
  }
  if (!motion.matches) {
    const animated = ".studio-lift, .product-card, .product-image img, .announcement-link .icon, [data-demo-result]"
    gsap.killTweensOf(animated)
    gsap.set(animated, { clearProps: "transform,opacity" })
  }
  void prepareStudio()
}

function hover(event: PointerEvent | FocusEvent, entering: boolean) {
  if (!motion.matches || !(event.target instanceof Element)) return
  if (event instanceof PointerEvent && (!fine.matches || event.pointerType === "touch")) return
  const item = event.target.closest<HTMLElement>(".studio-object, .product-card, .announcement-link")
  if (!item || (event.relatedTarget instanceof Node && item.contains(event.relatedTarget))) return
  if (item.matches(".studio-object")) {
    if (compact.matches || !studioLifts?.classList.contains("is-ready")) return
    const pointer = event instanceof PointerEvent
    if (!entering && (pointer ? item.matches(":focus-visible") : fine.matches && item.matches(":hover"))) return
    if (pointer || !entering || item.matches(":focus-visible")) lift(item, entering)
    return
  }
  if (!entering && (item.matches(":hover") && fine.matches || item.querySelector(":focus-visible"))) return
  const vars = { duration, ease: "power3.out", overwrite: "auto" } as const
  if (item.matches(".announcement-link")) {
    gsap.to(item.querySelector(".icon"), { x: entering ? 3 : 0, ...vars })
  } else {
    gsap.to(item, { y: entering ? -3 : 0, ...vars })
    const image = item.querySelector(".product-image img")
    if (image) gsap.to(image, { scale: entering ? 1.03 : 1, ...vars })
  }
}

document.addEventListener("pointerover", event => hover(event, true))
document.addEventListener("pointerout", event => hover(event, false))
document.addEventListener("focusin", event => hover(event, true))
document.addEventListener("focusout", event => hover(event, false))
document.addEventListener("storefront:top", scrollToTop)
document.addEventListener("storefront:navigated", () => {
  gsap.killTweensOf(".studio-lift")
  gsap.set(".studio-lift", { clearProps: "transform" })
})
document.addEventListener("storefront:commerce", event => {
  if (event.target instanceof Element) enter(event.target)
})
motion.addEventListener("change", syncPreferences)
fine.addEventListener("change", syncPreferences)
compact.addEventListener("change", syncPreferences)
syncPreferences()

const desktop = matchMedia("(min-width: 1201px)")
const loadNavigation = () => {
  if (!desktop.matches || !document.querySelector("[data-category-navigation]")) return
  desktop.removeEventListener("change", loadNavigation)
  const entry = "/storefront/vendor/navigation.js"
  void import(entry).catch(() => { /* The native dropdowns stay available. */ })
}
desktop.addEventListener("change", loadNavigation)
loadNavigation()

const footer = document.querySelector("[data-meadow-footer]")
if (footer) {
  const entry = "/storefront/vendor/footer.js"
  const mount = () => { void import(entry).catch(() => { /* The server footer stays available. */ }) }
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      mount()
    }, { rootMargin: "850px" })
    observer.observe(footer)
  } else mount()
}
