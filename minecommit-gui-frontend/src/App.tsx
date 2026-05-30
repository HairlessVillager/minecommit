import { Routes, Route } from "react-router-dom"
import { HomePage } from "@/pages/HomePage"
import { DashboardPage } from "@/pages/DashboardPage"
import { HistoryPage } from "@/pages/HistoryPage"
import { SettingsPage } from "@/pages/SettingsPage"

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}
