import { useState } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { LoaderCircleIcon } from "lucide-react"
import { Toaster } from "sonner"

import { useAppContext } from "@/hooks/app-context"
import { Sidebar } from "@/components/layout/sidebar"
import { TopNav } from "@/components/layout/top-nav"

import LoginPage from "@/pages/login"
import DashboardPage from "@/pages/dashboard"
import DevicesPage from "@/pages/devices"
import SmsInboxPage from "@/pages/sms/inbox"
import SmsForwardingPage from "@/pages/sms/forwarding"
import KeepalivePage from "@/pages/sim-cards/keepalive"
import ProfilePage from "@/pages/settings/profile"
import SecurityPage from "@/pages/settings/security"
import AboutPage from "@/pages/settings/about"
import LogsPage from "@/pages/logs"

function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_12%_8%,rgba(219,234,254,0.72),transparent_28%),radial-gradient(circle_at_88%_4%,rgba(224,242,254,0.56),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef4fb_100%)] text-slate-900 lg:h-dvh lg:overflow-hidden dark:bg-[radial-gradient(circle_at_12%_8%,rgba(30,64,175,0.24),transparent_30%),radial-gradient(circle_at_88%_4%,rgba(14,165,233,0.14),transparent_24%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] dark:text-slate-100">
      <TopNav onOpenMenu={() => setMobileMenuOpen(true)} />
      <div className="grid min-h-screen min-w-0 pt-16 lg:h-dvh lg:min-h-0 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
        <main className="min-w-0 px-0 py-0 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:px-8 lg:py-5">
          <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[96rem] flex-col gap-4 px-4 pb-8 pt-4 sm:px-6 sm:pb-10 lg:min-h-full lg:px-0 lg:pb-28 lg:pt-0">
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/devices/network" element={<DevicesPage />} />
              <Route path="/devices/esim" element={<DevicesPage />} />
              <Route path="/sms" element={<SmsInboxPage />} />
              <Route path="/sms/inbox" element={<Navigate to="/sms" replace />} />
              <Route path="/sms/forwarding" element={<SmsForwardingPage />} />
              <Route path="/sms/tasks" element={<KeepalivePage />} />
              <Route path="/sms/keepalive" element={<Navigate to="/sms/tasks" replace />} />
              <Route path="/sim-cards" element={<Navigate to="/devices/esim" replace />} />
              <Route path="/sim-cards/profiles" element={<Navigate to="/devices/esim" replace />} />
              <Route path="/sim-cards/keepalive" element={<Navigate to="/sms/tasks" replace />} />
              <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
              <Route path="/settings/mode" element={<Navigate to="/devices" replace />} />
              <Route path="/settings/profile" element={<ProfilePage />} />
              <Route path="/settings/security" element={<SecurityPage />} />
              <Route path="/settings/about" element={<AboutPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </main>
      </div>
      <Toaster richColors position="top-right" />
    </div>
  )
}

export default function App() {
  const { authStatus } = useAppContext()

  if (!authStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_8%,rgba(219,234,254,0.72),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef4fb_100%)] text-slate-600 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_100%)] dark:text-slate-300">
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
