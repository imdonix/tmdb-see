import * as React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowDownToLine,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  Tv,
} from "lucide-react";
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, cn } from "@tmdb-see/ui";
import { logout } from "@/lib/auth";
import { Brand, BrandMark } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/search", label: "Search", icon: Search },
  { to: "/follows", label: "Follows", icon: Tv },
  { to: "/downloads", label: "Downloads", icon: ArrowDownToLine },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

function isActivePath(pathname: string, item: (typeof NAV_ITEMS)[number]): boolean {
  if (item.to === "/") return pathname === "/";
  if (item.to === "/search") return pathname.startsWith("/search") || pathname.startsWith("/torrents");
  return pathname.startsWith(item.to);
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(location.pathname, item);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={"exact" in item ? item.exact : false}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
            )}
          >
            <item.icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/60 bg-card/35 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center justify-between px-4">
        <Brand />
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4 thin-scrollbar">
        <NavItems />
      </div>
      <div className="border-t border-border/60 p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={logout}
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl lg:hidden">
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} aria-label="Open navigation">
        <Menu />
      </Button>
      <Link to="/" className="flex items-center gap-2">
        <BrandMark className="size-8 rounded-lg" />
        <span className="text-sm font-semibold tracking-tight">See</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 pb-2">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand />
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
            <NavItems onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-border/60 p-3">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

export function AppShell() {
  return (
    <div className="min-h-dvh">
      <DesktopSidebar />
      <MobileHeader />
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
