import type { CSSProperties } from "react"
import { Heart } from "lucide-react"

export type PenView = { src: string; detailSrc?: string; label: string; clip: string; transform: string }
export type Pen = {
  id: string
  name: string
  description: string
  type: string
  saleLabel: string
  originalLabel: string
  discount: number
  onRail: boolean
  views: PenView[]
}

export function PenPhoto({ view, name, detail = false }: { view: PenView; name: string; detail?: boolean }) {
  return <span className="pen-photo">
    <img src={detail && view.detailSrc ? view.detailSrc : view.src} alt={name} draggable={false}
      data-uncut={view.clip === "none" || undefined} style={{ clipPath: view.clip, transform: view.transform }} />
  </span>
}

export function Prices({ pen }: { pen: Pen }) {
  return <p className="stationery-prices">
    <strong>{pen.saleLabel}</strong> {pen.discount > 0 && <del>{pen.originalLabel}</del>}
  </p>
}

export function PenDiscount({ discount }: { discount: number }) {
  return discount > 0 && <span className="discount-badge" data-discount-band={Math.min(Math.floor(discount / 10), 4) * 10}>
    {discount}% off
  </span>
}

export function SavePen({ pen }: { pen: Pen }) {
  return <button className="save" type="button" data-save={pen.id} data-name={pen.name}
    aria-label={`Save ${pen.name}`} aria-pressed="false">
    <Heart className="icon" strokeWidth={1.55} aria-hidden="true" />
  </button>
}

export function AddPen({ pen, quantity = false }: { pen: Pen; quantity?: boolean }) {
  return <form data-add={pen.id} className="stationery-add" method="post">
    {quantity && <label className="pen-quantity">Quantity
      <input type="number" name="quantity" defaultValue={1} min={1} max={99} required />
    </label>}
    <button type="submit" className="button">Add to cart</button>
    <p className="cart-note" data-add-message="" role="status" />
  </form>
}

// Adapted from Aakash Mehra's Product Shelf, using the store's shared pen inspector and cart.
export function PenProductShelf({ pens, heading, lifted, inspect }: {
  pens: Pen[]
  heading: string
  lifted?: string
  inspect: (pen: Pen, button: HTMLButtonElement) => void
}) {
  const rows: Pen[][] = []
  const rowSize = pens.length === 5 ? 3 : 4
  for (let index = 0; index < pens.length; index += rowSize) rows.push(pens.slice(index, index + rowSize))
  return <section className="pen-shelf" id="stationery-products" aria-labelledby="pen-shelf-heading">
    <div className="wrap">
      <h2 id="pen-shelf-heading">{heading}</h2>
      {!rows.length && <p>No pens match this product type.</p>}
      {rows.map(row => <div className="pen-shelf-row" key={row[0].id} data-count={row.length}
        style={{ "--shelf-columns": row.length } as CSSProperties}>
        {row.map(pen => <article className="pen-shelf-item" key={pen.id} data-lifted={lifted === pen.id}>
          <button className="pen-shelf-preview" type="button" aria-label={`View ${pen.name}`}
            aria-haspopup="dialog" onClick={event => inspect(pen, event.currentTarget)}>
            <span className="pen-shelf-figure"><PenPhoto view={pen.views[0]} name="" /></span>
          </button>
          <PenDiscount discount={pen.discount} />
          <SavePen pen={pen} />
          <h3>{pen.name}</h3>
          <Prices pen={pen} />
          <AddPen pen={pen} />
        </article>)}
      </div>)}
    </div>
  </section>
}
