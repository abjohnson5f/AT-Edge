import { Link, useLocation } from "react-router";
import { cn } from "@/src/lib/utils";
import { 
  LayoutDashboard, 
  Radar, 
  Import, 
  Briefcase, 
  Calculator, 
  UserCircle 
} from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Scout", href: "/scout", icon: Radar },
  { name: "Import", href: "/import", icon: Import },
  { name: "Portfolio", href: "/portfolio", icon: Briefcase },
  { name: "Price Check", href: "/price-check", icon: Calculator },
  { name: "Account", href: "/account", icon: UserCircle },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="flex h-full w-64 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-300">
      <div className="flex h-14 items-center border-b border-zinc-800 px-6">
        <span className="text-lg font-bold tracking-tight text-white">AT Edge</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-zinc-800 text-white"
                    : "hover:bg-zinc-800/50 hover:text-white"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-5 w-5 flex-shrink-0",
                    isActive ? "text-white" : "text-zinc-500"
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
