import { Routes, Route, Navigate } from "react-router-dom"
import { LoaderCircleIcon } from "lucide-react"
import { Toaster } from "sonner"

import { useAppContext } from "@/hooks/app-context"
import { Sidebar } from "@/components/layout/sidebar"
import { ShellPanel } from "@/components/layout/shell-panel"

import LoginPage from "@/pages/login"
import DashboardPage from "@/pages/dashboard"
import ModemStatusPage from "@/pages/devices/modem-status"
import NetworkSettingsPage from "@/pages/devices/network-settings"
import SmsInboxPage from "@/pages/sms/inbox"
import SmsForwardingPage from "@/pages/sms/forwarding"
import ProfilesPage from "@/pages/sim-cards/profiles"
import KeepalivePage from "@/pages/sim-cards/keepalive"
import ModeSwitchPage from "@/pages/settings/mode"
import SecurityPage from "@/pages/settings/security"
import AboutPage from "@/pages/settings/about"
import LogsPage from "@/pages/logs"

function AppLayout() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Sidebar />
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex min-h-screen w-full max-w-[96rem] flex-col gap-4 pb-24 sm:pb-28">
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/devices" element={<Navigate to="/devices/modem" replace />} />
              <Route path="/devices/modem" element={<ModemStatusPage />} />
              <Route path="/devices/network" element={<NetworkSettingsPage />} />
              <Route path="/sms" element={<Navigate to="/sms/inbox" replace />} />
              <Route path="/sms/inbox" element={<SmsInboxPage />} />
              <Route path="/sms/forwarding" element={<SmsForwardingPage />} />
              <Route path="/sim-cards" element={<Navigate to="/sim-cards/profiles" replace />} />
              <Route path="/sim-cards/profiles" element={<ProfilesPage />} />
              <Route path="/sim-cards/keepalive" element={<KeepalivePage />} />
              <Route path="/settings" element={<Navigate to="/settings/mode" replace />} />
              <Route path="/settings/mode" element={<ModeSwitchPage />} />
              <Route path="/settings/security" element={<SecurityPage />} />
              <Route path="/settings/about" element={<AboutPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>
      <ShellPanel />
      <Toaster richColors position="top-right" />
    </div>
  )
}

export default function App() {
  const { authStatus } = useAppContext()

  if (!authStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] text-slate-600">
        <LoaderCircleIcon className="mr-2 size-5 animate-spin" />
        正在进入 LinkHive...
      </div>
    )
  }

  if (authStatus.auth_enabled && !authStatus.authenticated) {
    return <LoginPage />
  }

  return <AppLayout />
}
