import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { useHousehold } from "../features/household/useHousehold";
import { useDisplayPrefs } from "../features/settings/useDisplayPrefs";
import { useRealtime } from "../features/realtime/useRealtime";
import InstallPrompt from "../features/install/InstallPrompt";

const NAV = [
  { to: "/familie", end: true, label: "Dashboard", emoji: "📊" },
  { to: "/familie/planning", label: "Planning", emoji: "🔁" },
  { to: "/familie/wie", label: "Familie", emoji: "👥" },
  { to: "/familie/huis", label: "Home Memory", emoji: "🏠" },
  { to: "/familie/fotos", label: "Herinneringen", emoji: "📷" },
  { to: "/familie/weetjes", label: "Weetjes", emoji: "📓" },
  { to: "/familie/berichten", label: "Berichten", emoji: "🎤" },
  { to: "/familie/logboek", label: "Zorglogboek", emoji: "📝" },
  { to: "/familie/documenten", label: "Documenten", emoji: "📄" },
  { to: "/familie/instellingen", label: "Instellingen", emoji: "⚙️" },
];

export default function FamilyLayout() {
  const { household, isLoading } = useHousehold();
  const { signOut } = useAuth();
  useDisplayPrefs(household?.household_id ?? "");
  useRealtime(household?.household_id ?? "");

  if (isLoading) return <p className="p-6 text-ink-soft">Even geduld…</p>;

  if (!household) return <Navigate to="/start" replace />;

  return (
    <>
      <InstallPrompt />

      <div className="flex min-h-screen">
        {/* Sidebar op desktop, onderaan tabs op mobiel. Familie werkt aan
          een bureau, de persoon op een tablet: twee verschillende noden. */}
        <aside className="hidden w-64 shrink-0 border-r border-line bg-surface px-3 py-5 lg:block">
          <div className="px-2 pb-5">
            <p className="text-lg font-extrabold tracking-tight">Thuis</p>
            <p className="text-sm text-ink-soft">{household.person_name}</p>
          </div>

          <nav aria-label="Hoofdnavigatie" className="space-y-0.5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold ${
                    isActive
                      ? "bg-accent-soft text-accent-ink"
                      : "text-ink-soft hover:bg-surface-soft"
                  }`
                }
              >
                <span className="w-6 text-center" aria-hidden="true">
                  {n.emoji}
                </span>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 space-y-2 px-2">
            <NavLink
              to="/persoon"
              className="block font-semibold text-accent-ink underline underline-offset-4"
            >
              Scherm van {household.person_name.split(" ")[0]}
            </NavLink>
            <button
              onClick={signOut}
              className="font-semibold text-ink-soft underline underline-offset-4"
            >
              Uitloggen
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-5xl px-5 pb-28 pt-6 lg:pb-12">
            <Outlet />
          </div>

          <nav
            aria-label="Hoofdnavigatie"
            className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-line bg-surface px-2 pt-1 lg:hidden"
            style={{
              paddingBottom: "calc(0.4rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex min-h-[3.4rem] min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-semibold ${
                    isActive
                      ? "bg-accent-soft text-accent-ink"
                      : "text-ink-faint"
                  }`
                }
              >
                <span className="text-xl leading-none" aria-hidden="true">
                  {n.emoji}
                </span>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
