import { createRoot } from "react-dom/client"
import MeadowRiseFooter from "@/components/ui/meadow-rise-footer"

const mount = document.querySelector<HTMLElement>("[data-meadow-footer]")
if (mount) createRoot(mount).render(<MeadowRiseFooter demoCheckout={mount.dataset.demoCheckout === "1"} />)
