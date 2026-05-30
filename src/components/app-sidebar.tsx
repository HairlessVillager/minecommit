import { NavLink, useLocation } from "react-router-dom"
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

const navItems = [
  { to: "/", label: "主页", icon: House },
  { to: "/dashboard", label: "看板", icon: LayoutDashboard },
  { to: "/history", label: "历史", icon: History },
]

export function AppSidebar() {
  const { pathname } = useLocation()

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
            {navItems.map(({ to, label, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  render={<NavLink to={to} end />}
                  isActive={
                    to === "/" ? pathname === "/" : pathname.startsWith(to)
                  }
                >
                  <Icon />
                  {label}
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
              isActive={pathname === "/settings"}
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
