import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layouts/app-sidebar"
import { GlobalRefreshButton } from "@/components/shared/global-refresh-button"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-y-auto bg-secondary/30">
        <div className="flex h-14 items-center border-b px-4 lg:px-6 bg-background">
          <SidebarTrigger />
          <GlobalRefreshButton />
        </div>
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
