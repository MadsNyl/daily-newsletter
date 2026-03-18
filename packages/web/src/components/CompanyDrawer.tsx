import { useState } from "react";
import type { Company } from "@/api/client";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface CompanyDrawerProps {
  companies: Company[];
  activeFilter: string | undefined;
  onFilterChange: (ticker: string | undefined) => void;
}

export default function CompanyDrawer({
  companies,
  activeFilter,
  onFilterChange,
}: CompanyDrawerProps) {
  const [open, setOpen] = useState(false);

  if (companies.length === 0) return null;

  const activeName = companies.find((c) => c.ticker === activeFilter)?.name;

  return (
    <div className="sm:hidden">
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              activeFilter
                ? "bg-accent text-white active:bg-accent-hover"
                : "bg-surface-raised text-ink-secondary ring-1 ring-border-light active:ring-accent/40"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z"
                  clipRule="evenodd"
                />
              </svg>
              {activeFilter ? activeName : "Filtrer etter selskap"}
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 ${activeFilter ? "text-white/70" : "text-ink-tertiary"}`}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-serif text-lg">Filtrer etter selskap</DrawerTitle>
          </DrawerHeader>

          <div className="flex flex-col gap-1 px-4 pb-6 pt-2">
            {activeFilter && (
              <button
                type="button"
                onClick={() => {
                  onFilterChange(undefined);
                  setOpen(false);
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-accent transition-colors active:bg-accent-subtle"
              >
                Vis alle artikler
              </button>
            )}
            {companies.map((c) => {
              const isActive = activeFilter === c.ticker;
              return (
                <button
                  key={c.ticker}
                  type="button"
                  onClick={() => {
                    onFilterChange(isActive ? undefined : c.ticker);
                    setOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-accent text-white"
                      : "text-ink active:bg-surface-raised"
                  }`}
                >
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`text-xs ${isActive ? "text-white/70" : "text-ink-tertiary"}`}
                  >
                    {c.ticker}
                  </span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
