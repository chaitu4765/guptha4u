"use client"

import { useId } from "react"

const ridges = [
  ["#b7c2ab", "#9fac95", "M0 256C163 224 242 260 391 229S670 162 860 226S1070 258 1200 212"],
  ["#a3b384", "#7d8f63", "M0 277C180 209 280 243 410 268S635 282 750 249S1030 178 1200 246"],
  ["#93a964", "#677c42", "M0 305C164 301 270 263 440 272S615 329 822 304S1074 230 1200 271"],
  ["#829a52", "#556a33", "M0 318C138 278 252 289 407 330S664 345 794 305S1021 291 1200 315"],
  ["#6c8240", "#415325", "M0 358C212 371 265 331 430 326S658 394 850 357S1030 307 1200 346"],
  ["#4d5d2c", "#253019", "M0 389C202 340 365 357 533 398S752 417 908 378S1080 349 1200 379"],
]

const categories = [
  ["Paints & Mediums", "paints"], ["Brushes & Painting Tools", "brushes"],
  ["Canvas", "canvas"], ["Easels", "easels"],
  ["Drawing & Illustration", "drawing"], ["Papers & Pads", "papers"],
  ["Accessories", "accessories"], ["Brands", "brands"],
]

export default function MeadowRiseFooter({ demoCheckout }: { demoCheckout: boolean }) {
  const id = useId()
  const columns = [
    { title: "Paint & make", links: categories.slice(0, 4).map(([name, slug]) => [name, "/shop/category/" + slug]) },
    { title: "Draw & design", links: categories.slice(4).map(([name, slug]) => [name, "/shop/category/" + slug]) },
    { title: "The store", links: [["Catalogue", "/shop/catalogue"], ["Your account", "/shop/account"],
      ["Wishlist", "/shop/wishlist"], ["Cart", "/shop/cart"], ["About this demo", "/shop/about"],
      ...(demoCheckout ? [["Gupta Privilege", "/shop/privilege"]] : [])] },
  ]
  return (
    <footer className="mrf-root">
      <div className="mrf-hero">
        <svg className="mrf-scene" viewBox="0 0 1200 450" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id={id + "mist"}>
              <stop stopColor="#f4f4ef" stopOpacity=".48" />
              <stop offset="1" stopColor="#e9ece3" stopOpacity="0" />
            </radialGradient>
            {ridges.map(([lit, shadow], index) => (
              <linearGradient id={id + index} key={lit} x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop stopColor={lit} /><stop offset="1" stopColor={shadow} />
              </linearGradient>
            ))}
          </defs>
          {ridges.map(([lit, , path], index) => (
            <path key={lit} className="mrf-ridge" style={{ animationDelay: index * 65 + "ms" }}
              d={path + "V450H0Z"} fill={`url(#${id}${index})`} />
          ))}
          <ellipse cx="508" cy="280" rx="500" ry="50" fill={`url(#${id}mist)`} />
        </svg>
        <div className="mrf-intro">
          <h2>Gupta <em>since 1916</em></h2>
          <p>{demoCheckout ? "Get member prices on art supplies." : "Paints, brushes, paper and supplies for your next piece."}</p>
          {demoCheckout && <a className="button" href="/shop/privilege">Join Gupta Privilege</a>}
        </div>
      </div>
      <div className="wrap mrf-wrap">
        <div className="mrf-grid">
          <div className="mrf-brand">
            <a href="/shop" className="wordmark"><span>Gupta</span><small>Art Store and Stationary</small></a>
            <p>Art materials and stationery for your workbench.</p>
            <a className="footer-instagram" href="https://www.instagram.com/gupta_artstore/">
              <img src="/storefront/instagram.svg" alt="" width="20" height="20" />
              Follow us on Instagram
            </a>
          </div>
          <nav className="mrf-cols" aria-label="Footer">
            {columns.map(({ title, links }) => (
              <div key={title}>
                <h3>{title}</h3>
                <ul>{links.map(([name, href]) => <li key={href}><a href={href}>{name}</a></li>)}</ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mrf-bottom">
          <p>© {new Date().getFullYear()} Gupta Art Store and Stationary</p>
          <a href="/shop/privacy">Privacy policy</a>
          <a href="/shop/refunds">Refund policy</a>
        </div>
      </div>
    </footer>
  )
}
