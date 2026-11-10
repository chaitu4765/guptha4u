import { createRoot } from "react-dom/client"
import { DropdownNavigation, type NavItem } from "@/components/ui/dorpdown-navigation"

const nav = document.querySelector<HTMLElement>("[data-category-navigation]")
if (nav) {
  const items: NavItem[] = Array.from(nav.querySelectorAll<HTMLElement>("[data-nav-key]"), element => {
    const id = element.dataset.navKey || ""
    return {
      id, label: element.querySelector("summary")?.textContent || "",
      href: "/shop/category/" + id,
      subMenus: Array.from(element.querySelectorAll(".nav-branch"), branch => {
        const group = branch.querySelector<HTMLAnchorElement>(".nav-group-link")!
        return {
          label: group.textContent || "", href: group.getAttribute("href") || "",
          items: Array.from(branch.querySelectorAll<HTMLAnchorElement>(".nav-leaf-link"), leaf => ({
            label: leaf.textContent || "", href: leaf.getAttribute("href") || "",
          })),
        }
      }),
    }
  })
  if (items.length) createRoot(nav).render(<DropdownNavigation navItems={items} />)
}
