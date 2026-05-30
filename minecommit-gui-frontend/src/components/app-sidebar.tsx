import { NavLink } from "react-router-dom"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  ChevronDown,
  HardDrive,
  History,
  House,
  LayoutDashboard,
  Settings,
} from "lucide-react"
import { useState } from "react"

const allItems = [
  { to: "/", label: "主页", icon: House },
  { to: "/dashboard", label: "看板", icon: LayoutDashboard },
  { to: "/history", label: "历史", icon: History },
  { to: "/settings", label: "设置", icon: Settings },
]
const navItems = allItems.slice(0, -1)
const settingsItem = allItems.at(-1)

export function AppSidebar() {
  const [activeItem, setActiveItem] = useState(navItems[0])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton>
                    <HardDrive />
                    选择存档
                    <ChevronDown className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent className="w-[--radix-popper-anchor-width]">
                <DropdownMenuItem>
                  <span>存档 1</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <span>存档 2</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <span>存档 3</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  render={<NavLink to={item.to} end />}
                  isActive={item.to === activeItem.to}
                  onClick={() => setActiveItem(item)}
                >
                  <item.icon />
                  {item.label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<NavLink to="/settings" />}
              isActive={activeItem.to === "/settings"}
              onClick={() => setActiveItem(settingsItem || navItems[0])}
            >
              <Settings />
              设置
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
