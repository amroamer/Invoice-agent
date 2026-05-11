import {
  Activity,
  Bell,
  Briefcase,
  ClipboardList,
  FileBarChart,
  HelpCircle,
  History,
  LayoutDashboard,
  ScrollText,
  Settings as SettingsIcon,
  Truck,
  Upload,
  Users as UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import type { Role } from "@/api/auth";
import { UploadModal } from "@/components/UploadModal";
import { KpmgLogo } from "@/components/ui/KpmgLogo";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

type NavItem = { to: string; label: string; icon: LucideIcon; roles: Role[] };

const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["officer", "admin"] },
  { to: "/invoices", label: "Invoices", icon: FileBarChart, roles: ["officer", "admin"] },
  { to: "/projects", label: "Projects", icon: Briefcase, roles: ["officer", "admin"] },
  { to: "/vendors", label: "Vendors", icon: Truck, roles: ["officer", "admin"] },
  { to: "/contracts", label: "Contracts", icon: ClipboardList, roles: ["officer", "admin"] },
  { to: "/historical-invoices", label: "Historical invoices", icon: History, roles: ["officer", "admin"] },
  { to: "/users", label: "Users", icon: UsersIcon, roles: ["admin"] },
  { to: "/audit", label: "Audit log", icon: ScrollText, roles: ["admin"] },
  { to: "/system-health", label: "System health", icon: Activity, roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["officer", "admin"] },
];

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Layout() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-brand-dark text-white" data-testid="sidebar">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <KpmgLogo size="sm" />
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">KPMG</p>
            <p className="text-sm font-semibold text-white">Finance Invoicing Agent</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
          {navItems
            .filter((item) => me && item.roles.includes(me.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                data-testid={`nav-${item.to.replace(/\//g, "") || "home"}`}
                className={({ isActive }) =>
                  cn(
                    "mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-brand-medium text-white shadow-card"
                      : "text-white/75 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                <item.icon size={18} strokeWidth={1.75} />
                <span>{item.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-white/10 px-3 py-3">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-white/10"
            data-testid="user-chip"
            onClick={() => navigate("/settings")}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand">
              {initials(me?.full_name ?? me?.username)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {me?.full_name ?? me?.username ?? "—"}
              </p>
              <p className="truncate text-xs text-white/60 capitalize">{me?.role ?? ""}</p>
            </div>
          </button>
          <button
            onClick={() => logout()}
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
            data-testid="sign-out"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-end gap-3 border-b border-slate-200 bg-white px-6">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand"
            onClick={() => setUploadOpen(true)}
            data-testid="upload-invoice-btn"
          >
            <Upload size={16} />
            Upload invoice
          </button>
          <button
            type="button"
            className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
            aria-label="Notifications"
            data-testid="notifications-btn"
          >
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              2
            </span>
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
            aria-label="Help"
          >
            <HelpCircle size={18} />
          </button>
          <div className="ml-1 flex items-center gap-3 border-l border-slate-200 pl-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900" data-testid="topbar-name">
                {me?.full_name ?? me?.username ?? "—"}
              </p>
              <p className="text-[11px] capitalize text-slate-500">
                {me?.role === "admin" ? "System Administrator" : me?.role ?? ""}
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand">
              {initials(me?.full_name ?? me?.username)}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 px-8 py-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={() => setUploadOpen(false)} />
    </div>
  );
}
