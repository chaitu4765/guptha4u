import { gsap } from "gsap"

const loader = document.querySelector<HTMLElement>("[data-studio-loading]")
const motion = matchMedia("(prefers-reduced-motion: no-preference)")
const toolsImage = new Image()
let opening: gsap.core.Timeline | undefined

if (loader && motion.matches) toolsImage.src = "/storefront/motion-tools.webp"

if (loader?.dataset.loadingMode === "opening" && !loader.hidden) {
  const brush = loader.querySelector<SVGGElement>(".loader-paintbrush")!
  opening = gsap.timeline({ onComplete: () => {
    loader.hidden = true
    loader.classList.remove("is-painting")
    gsap.set(loader, { clearProps: "opacity" })
  } })
  loader.querySelectorAll<SVGPathElement>("[data-logo-stroke]").forEach((stroke, index) => {
    const progress = { value: 0 }
    const length = stroke.getTotalLength()
    const follow = () => {
      const point = stroke.getPointAtLength(length * progress.value)
      brush.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${-19 + 8 * Math.sin(progress.value * Math.PI)})`)
      stroke.style.strokeDashoffset = String(1 - progress.value)
    }
    opening!.call(follow)
      .to(brush, { opacity: 1, duration: .13, ease: "sine.out" })
      .to(progress, { value: 1, duration: [1.2, .32, .91][index], ease: "sine.inOut", onUpdate: follow })
      .to(brush, { opacity: 0, duration: .14, ease: "sine.in" })
  })
  opening.to(".loader-logo-finish", { opacity: 1, duration: .26, ease: "sine.out" })
    .to(loader, { opacity: 0, duration: .42, ease: "power2.inOut" }, "+=.14")
}

const bands = 88
type Row = { x: number; y: number; width: number }
type Tool = { x: number; y: number; width: number; height: number; rows: Row[] }

function measureTool(pixels: ImageData, [x, y, width, height]: number[]): Tool {
  const rows: Row[] = []
  for (let row = y; row < y + height; row++) {
    const alpha = (column: number) => pixels.data[(row * pixels.width + column) * 4 + 3]
    let left = x
    let right = x + width - 1
    while (left < right && alpha(left) < 148) left++
    while (right > left && alpha(right) < 148) right--
    if (right - left > 1) rows.push({ x: left, y: row, width: right - left + 1 })
  }
  if (!rows.length) throw new Error("Missing photo silhouette")
  const left = Math.min(...rows.map(row => row.x))
  const right = Math.max(...rows.map(row => row.x + row.width))
  const top = rows[0].y
  return { x: left, y: top, width: right - left, height: rows.at(-1)!.y - top + 1,
    rows: Array.from({ length: bands }, (_, index) => rows[Math.floor((index + .5) * rows.length / bands)]) }
}

const measuredTools = toolsImage.src ? toolsImage.decode().then(() => {
  const canvas = document.createElement("canvas")
  canvas.width = toolsImage.naturalWidth
  canvas.height = toolsImage.naturalHeight
  const context = canvas.getContext("2d")!
  context.drawImage(toolsImage, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  return [[160, 0, 63, 380], [540, 0, 73, 380], [30, 416, 318, 331], [430, 416, 291, 331]]
    .map(region => measureTool(pixels, region))
}).catch(() => null) : Promise.resolve(null)

const mix = (a: number, b: number, progress: number) => a + (b - a) * progress

function drawMorph(context: CanvasRenderingContext2D, from: Tool, to: Tool, progress: number) {
  const { width, height } = context.canvas
  const scale = (width - 20) / Math.max(from.width, from.height, to.width, to.height)
  context.clearRect(0, 0, width, height)
  if (progress === 0 || progress === 1) {
    const frame = progress === 0 ? from : to
    const w = frame.width * scale
    const h = frame.height * scale
    context.drawImage(toolsImage, frame.x, frame.y, frame.width, frame.height, (width - w) / 2, (height - h) / 2, w, h)
    return
  }
  const h = mix(from.height, to.height, progress) * scale
  const band = h / bands
  const top = (height - h) / 2
  // Both photos are sampled onto the same changing outline, so the material follows the shape.
  from.rows.forEach((a, index) => {
    const b = to.rows[index]
    const x = mix(a.x - from.x - from.width / 2, b.x - to.x - to.width / 2, progress) * scale + width / 2
    const w = mix(a.width, b.width, progress) * scale
    const y = top + index * band
    context.globalAlpha = 1
    context.drawImage(toolsImage, a.x, a.y, a.width, 1, x, y, w, band + .5)
    context.globalAlpha = progress
    context.drawImage(toolsImage, b.x, b.y, b.width, 1, x, y, w, band + .5)
  })
  context.globalAlpha = 1
}

document.addEventListener("click", async event => {
  if (!loader || !motion.matches || event.defaultPrevented || event.button || event.ctrlKey || event.metaKey ||
      event.shiftKey || event.altKey || !(event.target instanceof Element)) return
  const link = event.target.closest<HTMLAnchorElement>("a[data-department-switch]")
  const destination = link?.dataset.departmentSwitch
  if (!link || !destination || link.target || destination === document.body.dataset.department) return
  event.preventDefault()
  if (!loader.hidden && loader.dataset.loadingMode === "switch") return
  opening?.kill()
  loader.classList.remove("is-painting")
  gsap.set(loader, { clearProps: "opacity" })
  const toStationery = destination === "stationery"
  loader.querySelector("[role=status]")!.textContent = toStationery ? "Opening Stationery…" : "Opening Art Store…"
  loader.querySelector(".department-hook")!.textContent = toStationery
    ? "From brushstrokes to pen strokes."
    : "From ink on paper to colour on canvas."
  loader.dataset.loadingMode = "switch"
  loader.hidden = false
  let navigating = false
  const navigate = () => {
    if (navigating) return
    navigating = true
    clearTimeout(navigationDeadline)
    try { sessionStorage.setItem("gupta:department-arrival", destination) } catch { /* The page still opens. */ }
    location.assign(link.href)
  }
  const navigationDeadline = window.setTimeout(navigate, 2900)
  const frames = await Promise.race([measuredTools, new Promise<null>(resolve => setTimeout(() => resolve(null), 500))])
  if (navigating) return
  if (!frames || !motion.matches) { navigate(); return }
  const transition = gsap.timeline({ onComplete: navigate })
  loader.querySelectorAll(".department-morph canvas").forEach((canvas, index) => {
    const context = (canvas as HTMLCanvasElement).getContext("2d")!
    const from = frames[index * 2 + (toStationery ? 0 : 1)]
    const to = frames[index * 2 + (toStationery ? 1 : 0)]
    const progress = { value: 0 }
    drawMorph(context, from, to, 0)
    transition.to(progress, { value: 1, duration: 1.06, ease: "sine.inOut", onUpdate: () => {
      drawMorph(context, from, to, progress.value)
    } }, .27 + index * .13)
  })
  const content = loader.querySelectorAll(".department-morph, .department-hook, [role=status]")
  transition.to(content, { opacity: 0, duration: .26, ease: "sine.inOut",
  }, "+=.25")
})

window.addEventListener("pageshow", event => {
  if (event.persisted && loader) {
    gsap.set(loader.querySelectorAll(".department-morph, .department-hook, [role=status]"), { clearProps: "opacity" })
  }
})
