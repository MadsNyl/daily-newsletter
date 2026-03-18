import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Menu, Newspaper, TrendingUp } from "lucide-react";

const NAV_ITEMS = [
  { label: "Nyheter", path: "/", icon: Newspaper },
  { label: "Aksjer", path: "/companies", icon: TrendingUp },
];

export default function NavigationDrawer() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/")
      return location.pathname === "/" || /^\/\d{4}-\d{2}-\d{2}$/.test(location.pathname);
    return location.pathname.startsWith(path);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button className="p-2 -ml-2 text-ink-secondary hover:text-ink transition-colors">
          <Menu size={20} />
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Navigasjon</DrawerTitle>
        </DrawerHeader>
        <nav className="px-4 pb-8">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-accent-light text-accent font-semibold"
                    : "text-ink-secondary hover:bg-surface-raised"
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
