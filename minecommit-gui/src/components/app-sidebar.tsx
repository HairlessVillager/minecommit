import { NavLink, useNavigate } from "react-router-dom"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Archive,
  ChevronDown,
  HardDrive,
  // History,
  House,
  // LayoutDashboard,
  Settings,
} from "lucide-react"
import { useSaves } from "@/contexts/saves"

const allItems = [
  { to: "/", label: "主页", icon: House },
  // { to: "/dashboard", label: "看板", icon: LayoutDashboard },
  // { to: "/history", label: "历史", icon: History },
  { to: "/settings", label: "设置", icon: Settings },
]
const navItems = allItems.slice(0, -1)

export function AppSidebar() {
  const navigate = useNavigate()
  const { saves, selectedSave, setSelectedSave } = useSaves()

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
                    {selectedSave ? selectedSave.name : "选择存档"}
                    <ChevronDown className="ml-auto" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent className="w-auto" align="start">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => navigate("/save-manage")}>
                    <Archive />
                    管理存档
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>近期存档</DropdownMenuLabel>
                  {saves.length === 0 ? (
                    <DropdownMenuItem disabled>暂无存档</DropdownMenuItem>
                  ) : (
                    saves.map((save) => (
                      <DropdownMenuItem
                        key={save.name}
                        onClick={() => setSelectedSave(save)}
                      >
                        <HardDrive />
                        {save.name}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuGroup>
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
                <SidebarMenuButton render={<NavLink to={item.to} end />}>
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
            <SidebarMenuButton render={<NavLink to="/settings" />}>
              <Settings />
              设置
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
