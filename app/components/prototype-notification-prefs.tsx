// PROTOTYPE (wayfinder #6 — https://github.com/vladgafarov/cohort-005-project/issues/6)
// Throwaway UI prototype — never merge; lives only on branch research/notifications-ux.
//
// Three takes on the notification preferences UI, chosen by the ?prefs= URL
// param on /settings (see PrototypeSwitcher):
//   P1 — FlatPrefs: one "Notifications" card under Profile, one toggle per Event.
//   P2 — GroupedPrefs: sections with master toggles (Refunds / Course activity /
//        Team Licence / Account).
//   P3 — TabbedPrefs: the body for a "Notifications" tab on the settings page
//        itself (the tab shell lives in settings.tsx).
//
// Cadence has one Channel — the in-app feed (#5) — so there are no per-channel
// toggles, only per-Event ones. Toggle state is in-memory; nothing is saved.

import { useMemo, useState } from "react";
import { UserRole } from "~/db/schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import {
  PROTOTYPE_EVENT_META,
  prototypePrefsFor,
  type PrototypeEventType,
  type PrototypePref,
} from "~/lib/prototype-notifications";

const CHANNEL_CAPTION =
  "Cadence has one notification Channel — the in-app feed. Choose which Events land in it.";

// ---------------------------------------------------------------------------
// Shared pieces

function PrototypeToggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className="block size-4 rounded-full bg-background shadow transition-transform"
        style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function PrototypePrefFootnote({
  prefs,
  offCount,
}: {
  prefs: PrototypePref[];
  offCount: number;
}) {
  return (
    <p className="pt-2 text-[11px] text-muted-foreground/70">
      PROTOTYPE — {prefs.length - offCount} of {prefs.length} on · choices are
      not saved
    </p>
  );
}

function usePrototypePrefState(prefs: PrototypePref[]) {
  const [offKeys, setOffKeys] = useState<ReadonlySet<string>>(new Set());
  return {
    offKeys,
    isOn: (key: string) => !offKeys.has(key),
    toggle: (key: string) =>
      setOffKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    setAll: (keys: string[], on: boolean) =>
      setOffKeys((prev) => {
        const next = new Set(prev);
        for (const key of keys) {
          if (on) next.delete(key);
          else next.add(key);
        }
        return next;
      }),
  };
}

// ---------------------------------------------------------------------------
// Entry point

export function PrototypeNotificationPrefs({
  variant,
  role,
  isTeamAdmin,
}: {
  variant: string;
  role: UserRole;
  isTeamAdmin: boolean;
}) {
  if (variant === "P2") return <GroupedPrefs role={role} isTeamAdmin={isTeamAdmin} />;
  if (variant === "P3") return <TabbedPrefs role={role} isTeamAdmin={isTeamAdmin} />;
  return <FlatPrefs role={role} isTeamAdmin={isTeamAdmin} />; // P1
}

// ---------------------------------------------------------------------------
// P1 — one flat card

function FlatPrefs({
  role,
  isTeamAdmin,
}: {
  role: UserRole;
  isTeamAdmin: boolean;
}) {
  const prefs = useMemo(
    () => prototypePrefsFor(role, isTeamAdmin),
    [role, isTeamAdmin]
  );
  const state = usePrototypePrefState(prefs);

  return (
    <Card className="mt-8 max-w-md">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">{CHANNEL_CAPTION}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {prefs.map((pref) => {
          const Icon = PROTOTYPE_EVENT_META[pref.key].icon;
          return (
            <div
              key={pref.key}
              className="flex items-center justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-muted/50"
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{pref.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {pref.description}
                  </p>
                </div>
              </div>
              <PrototypeToggle
                on={state.isOn(pref.key)}
                onToggle={() => state.toggle(pref.key)}
                label={pref.label}
              />
            </div>
          );
        })}
        <PrototypePrefFootnote prefs={prefs} offCount={state.offKeys.size} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// P2 — grouped sections with masters

const PROTOTYPE_PREF_GROUPS: {
  id: string;
  label: string;
  keys: PrototypeEventType[];
}[] = [
  {
    id: "refunds",
    label: "Refund activity",
    keys: ["refund-raised", "refund-decided"],
  },
  {
    id: "courses",
    label: "Course activity",
    keys: [
      "lesson-comment",
      "comment-reply",
      "course-rating",
      "course-status",
      "new-lesson",
    ],
  },
  { id: "team", label: "Team Licence", keys: ["seat-claimed"] },
  { id: "account", label: "Account changes", keys: ["role-changed"] },
];

function GroupedPrefs({
  role,
  isTeamAdmin,
}: {
  role: UserRole;
  isTeamAdmin: boolean;
}) {
  const prefs = useMemo(
    () => prototypePrefsFor(role, isTeamAdmin),
    [role, isTeamAdmin]
  );
  const state = usePrototypePrefState(prefs);

  const groups = PROTOTYPE_PREF_GROUPS.map((group) => ({
    ...group,
    prefs: group.keys
      .map((key) => prefs.find((p) => p.key === key))
      .filter((p): p is PrototypePref => !!p),
  })).filter((group) => group.prefs.length > 0);

  return (
    <Card className="mt-8 max-w-md">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">{CHANNEL_CAPTION}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => {
          const allOn = group.prefs.every((p) => state.isOn(p.key));
          return (
            <div key={group.id}>
              <div className="flex items-center justify-between gap-4 border-b pb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  {allOn ? "All on" : "Some off"}
                  <PrototypeToggle
                    on={allOn}
                    onToggle={() => state.setAll(
                      group.prefs.map((p) => p.key),
                      !allOn
                    )}
                    label={`${group.label} — all`}
                  />
                </label>
              </div>
              <div className="mt-1 space-y-0.5">
                {group.prefs.map((pref) => (
                  <div
                    key={pref.key}
                    className="flex items-center justify-between gap-4 rounded-md px-2 py-2 hover:bg-muted/50"
                  >
                    <div className="pl-4">
                      <p className="text-sm font-medium">{pref.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {pref.description}
                      </p>
                    </div>
                    <PrototypeToggle
                      on={state.isOn(pref.key)}
                      onToggle={() => state.toggle(pref.key)}
                      label={pref.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <PrototypePrefFootnote prefs={prefs} offCount={state.offKeys.size} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// P3 — body of the settings "Notifications" tab (shell in settings.tsx)

function TabbedPrefs({
  role,
  isTeamAdmin,
}: {
  role: UserRole;
  isTeamAdmin: boolean;
}) {
  const prefs = useMemo(
    () => prototypePrefsFor(role, isTeamAdmin),
    [role, isTeamAdmin]
  );
  const state = usePrototypePrefState(prefs);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">{CHANNEL_CAPTION}</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {prefs.map((pref) => {
            const Icon = PROTOTYPE_EVENT_META[pref.key].icon;
            return (
              <div
                key={pref.key}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors",
                  state.isOn(pref.key) ? "border-border" : "border-dashed border-border bg-muted/40"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      state.isOn(pref.key)
                        ? "text-primary"
                        : "text-muted-foreground/50"
                    )}
                  />
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pref.description}
                    </p>
                  </div>
                </div>
                <PrototypeToggle
                  on={state.isOn(pref.key)}
                  onToggle={() => state.toggle(pref.key)}
                  label={pref.label}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          In-app feed only — the refund emails you receive today are separate
          and unaffected.
        </p>
        <PrototypePrefFootnote prefs={prefs} offCount={state.offKeys.size} />
      </CardContent>
    </Card>
  );
}
