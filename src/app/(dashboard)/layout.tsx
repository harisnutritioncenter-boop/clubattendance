import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layouts/app-sidebar"
import { GlobalRefreshButton } from "@/components/shared/global-refresh-button"
import { MobileBottomBar } from "@/components/layouts/mobile-bottom-bar"
import { TopBarTitle } from "@/components/shared/top-bar-title"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-y-auto bg-secondary/30">
        <div className="flex h-14 items-center border-b px-4 lg:px-6 bg-background justify-between sticky top-0 z-10 relative">
          <div className="flex-1 flex justify-start">
            <SidebarTrigger />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <TopBarTitle />
          </div>
          <div className="flex-1 flex justify-end">
            <GlobalRefreshButton />
          </div>
        </div>
        <div className="p-4 lg:p-8 pb-20 md:pb-8">
          {children}
        </div>
      </main>
      <MobileBottomBar />
    </SidebarProvider>
  )
}
