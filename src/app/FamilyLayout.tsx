import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useHousehold } from "../features/household/useHousehold";
import { useDisplayPrefs } from "../features/settings/useDisplayPrefs";
import { useRealtime } from "../features/realtime/useRealtime";
import InstallPrompt from "../features/install/InstallPrompt";
import Icon, { type IconNaam } from "../components/Icon";
import AccountBar from "./AccountBar";

const NAV: { to: string; end?: boolean; label: string; icoon: IconNaam }[] = [
  { to: '/familie', end: true, label: 'Dashboard', icoon: 'dashboard' },
  { to: '/familie/planning', label: 'Planning', icoon: 'planning' },
  { to: '/familie/wie', label: 'Familie', icoon: 'wie' },
  { to: '/familie/huis', label: 'Home Memory', icoon: 'vandaag' },
  { to: '/familie/fotos', label: 'Herinneringen', icoon: 'fotos' },
  { to: '/familie/weetjes', label: 'Weetjes', icoon: 'weetjes' },
  { to: '/familie/berichten', label: 'Berichten', icoon: 'praten' },
  { to: '/familie/logboek', label: 'Zorglogboek', icoon: 'logboek' },
  { to: '/familie/documenten', label: 'Documenten', icoon: 'documenten' },
  { to: '/familie/delen', label: 'Wie ziet wat', icoon: 'wie' },
  { to: '/familie/instellingen', label: 'Instellingen', icoon: 'instellingen' },
];

export default function FamilyLayout() {
  const { household, isLoading } = useHousehold();
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
        <aside className="hidden w-64 shrink-0 border-r border-line bg-surface px-3 py-5 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
          <div className="pb-4">
            <p className="px-2 pb-3 text-lg font-extrabold tracking-tight">
              {household.is_self ? "Beheren" : "Thuis"}
            </p>
            <AccountBar />
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
                <Icon naam={n.icoon} size={19} />
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
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-5xl px-5 pb-28 pt-6 lg:pb-12">
            <div className="mb-4 lg:hidden">
              <AccountBar />
            </div>
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
                <Icon naam={n.icoon} size={20} />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
