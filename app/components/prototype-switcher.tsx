// PROTOTYPE (wayfinder #6 — https://github.com/vladgafarov/cohort-005-project/issues/6)
// Throwaway UI prototype — never merge; lives only on branch research/notifications-ux.
//
// The floating bottom bar that cycles the prototype variants. The center
// cluster (?variant=) is available everywhere; the preferences cluster
// (?prefs=) only appears on /settings. Absent params render today's app
// untouched. Hidden in production builds.

import { useCallback, useEffect } from "react";
import { useLocation, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

type VariantOption = { key: string | null; label: string };

const CENTER_VARIANTS: VariantOption[] = [
  { key: null, label: "off (live app)" },
  { key: "A", label: "A · bell dropdown" },
  { key: "B", label: "B · notifications page" },
  { key: "C", label: "C · inbox drawer" },
];

const PREFS_VARIANTS: VariantOption[] = [
  { key: null, label: "off" },
  { key: "P1", label: "P1 · settings card" },
  { key: "P2", label: "P2 · grouped sections" },
  { key: "P3", label: "P3 · notifications tab" },
];

function cycleKey(
  options: VariantOption[],
  current: string | null,
  direction: 1 | -1
): string | null {
  const index = options.findIndex((o) => o.key === current);
  const safeIndex = index === -1 ? 0 : index;
  return options[
    (safeIndex + direction + options.length) % options.length
  ].key;
}

export function PrototypeSwitcher() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const centerParam = searchParams.get("variant");
  const prefsParam = searchParams.get("prefs");

  const center = CENTER_VARIANTS.some((o) => o.key === centerParam)
    ? centerParam
    : null;
  const prefs = PREFS_VARIANTS.some((o) => o.key === prefsParam)
    ? prefsParam
    : null;
  const onSettings = location.pathname === "/settings";

  const setParam = useCallback(
    (name: string, key: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === null) next.delete(name);
          else next.set(name, key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // ←/→ cycle the notification-center variant (skipped while typing).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setParam(
        "variant",
        cycleKey(CENTER_VARIANTS, center, event.key === "ArrowRight" ? 1 : -1)
      );
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [center, setParam]);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 print:hidden">
      <div className="flex items-center gap-2 rounded-full border border-dashed border-background/30 bg-foreground px-3 py-1.5 text-background shadow-xl">
        <span className="pl-1 text-[10px] font-bold uppercase tracking-wider opacity-60">
          Prototype #6
        </span>

        <CycleControl
          label={CENTER_VARIANTS.find((o) => o.key === center)?.label ?? "off"}
          labelClassName="min-w-[150px]"
          onPrev={() => setParam("variant", cycleKey(CENTER_VARIANTS, center, -1))}
          onNext={() => setParam("variant", cycleKey(CENTER_VARIANTS, center, 1))}
        />

        {onSettings && (
          <CycleControl
            label={`prefs: ${PREFS_VARIANTS.find((o) => o.key === prefs)?.label ?? "off"}`}
            labelClassName="min-w-[120px]"
            onPrev={() => setParam("prefs", cycleKey(PREFS_VARIANTS, prefs, -1))}
            onNext={() => setParam("prefs", cycleKey(PREFS_VARIANTS, prefs, 1))}
          />
        )}
      </div>
    </div>
  );
}

function CycleControl({
  label,
  labelClassName,
  onPrev,
  onNext,
}: {
  label: string;
  labelClassName?: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <span className="flex items-center gap-0.5 rounded-full bg-background/10 px-1 py-0.5">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous variant"
        className="rounded-full p-1 transition-colors hover:bg-background/20"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className={`text-center text-[11px] font-medium ${labelClassName}`}>
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next variant"
        className="rounded-full p-1 transition-colors hover:bg-background/20"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </span>
  );
}
