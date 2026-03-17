import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface DateDrawerProps {
  currentDate: string;
  maxDate: string;
  displayDate: string;
  onDateChange: (date: string) => void;
  onNavigate: (offset: number) => void;
  isToday: boolean;
}

function generateWeekDates(centerDate: string, maxDate: string): string[] {
  const [y, m, d] = centerDate.split("-").map(Number);
  const center = new Date(y, m - 1, d);
  const dates: string[] = [];

  for (let i = -7; i <= 7; i++) {
    const dt = new Date(center.getTime());
    dt.setDate(dt.getDate() + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    if (iso <= maxDate) dates.push(iso);
  }

  return dates;
}

function formatShortDate(dateStr: string): { day: string; weekday: string; isToday: boolean } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const isToday =
    dt.getFullYear() === today.getFullYear() &&
    dt.getMonth() === today.getMonth() &&
    dt.getDate() === today.getDate();

  return {
    day: String(d),
    weekday: dt.toLocaleDateString("nb-NO", { weekday: "short" }).replace(".", ""),
    isToday,
  };
}

export default function DateDrawer({
  currentDate,
  maxDate,
  displayDate,
  onDateChange,
  onNavigate,
  isToday,
}: DateDrawerProps) {
  const [open, setOpen] = useState(false);
  const dates = generateWeekDates(currentDate, maxDate);

  return (
    <div className="flex items-center justify-between sm:hidden">
      <button
        type="button"
        onClick={() => onNavigate(-1)}
        className="px-3 py-2 text-sm font-medium text-ink-secondary transition-colors active:text-accent"
      >
        &larr;
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="flex flex-col items-center gap-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="font-serif text-lg capitalize text-ink">{displayDate}</span>
            <span className="text-xs text-ink-tertiary">Trykk for å velge dato</span>
          </button>
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-serif text-lg">Velg dato</DrawerTitle>
          </DrawerHeader>

          <div className="overflow-x-auto px-4 pb-6 pt-2">
            <div className="flex gap-1.5">
              {dates.map((d) => {
                const info = formatShortDate(d);
                const isSelected = d === currentDate;

                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      onDateChange(d);
                      setOpen(false);
                    }}
                    className={`flex min-w-[3rem] shrink-0 flex-col items-center gap-0.5 rounded-lg px-2.5 py-2.5 text-sm transition-all ${
                      isSelected
                        ? "bg-accent text-white"
                        : info.isToday
                          ? "bg-accent-subtle text-accent ring-1 ring-accent/20"
                          : "bg-surface-raised text-ink-secondary active:bg-accent-subtle"
                    }`}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">
                      {info.weekday}
                    </span>
                    <span className="text-lg font-medium">{info.day}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border-light px-4 py-3">
            <input
              type="date"
              value={currentDate}
              max={maxDate}
              onChange={(e) => {
                if (e.target.value) {
                  onDateChange(e.target.value);
                  setOpen(false);
                }
              }}
              className="w-full rounded-lg border border-border-light bg-surface-raised px-3 py-2.5 text-base text-ink-secondary"
            />
          </div>
        </DrawerContent>
      </Drawer>

      <button
        type="button"
        onClick={() => onNavigate(1)}
        disabled={isToday}
        className="px-3 py-2 text-sm font-medium text-ink-secondary transition-colors active:text-accent disabled:opacity-30"
      >
        &rarr;
      </button>
    </div>
  );
}
