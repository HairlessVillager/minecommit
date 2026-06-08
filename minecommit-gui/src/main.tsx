import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"

import "./index.css"
import { App } from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { SidebarProvider } from "@/components/ui/sidebar.tsx"
import { AppSidebar } from "@/components/app-sidebar.tsx"
import { SavesProvider } from "@/contexts/saves-context.tsx"
import { CommitAuthorProvider } from "@/contexts/commit-author-context.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          <SidebarProvider defaultOpen={false}>
            <SavesProvider>
              <CommitAuthorProvider>
                <AppSidebar />
                <App />
              </CommitAuthorProvider>
            </SavesProvider>
          </SidebarProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
