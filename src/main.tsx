import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { persister, queryClient } from "./app/queryClient";
import OfflineBanner from "./app/OfflineBanner";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import AcceptInvite from "./features/auth/AcceptInvite";
import Welcome from "./features/auth/Welcome";
import PersonShell from "./PersonShell";
import PersonLayout from "./app/PersonLayout";
import WhoIsWho, { PersonDetail } from "./features/people/WhoIsWho";
import Help from "./features/people/Help";
import WhatNow from "./features/today/WhatNow";
import Talk from "./features/voice/Talk";
import Notes from "./features/notes/Notes";
import InstallGuide from "./features/install/InstallGuide";
import MemoryHome from "./features/home-memory/MemoryHome";
import Photos from "./features/memories/Photos";
import { RoomItems } from "./features/home-memory/RoomGrid";
import ItemDetail from "./features/home-memory/ItemDetail";
// De tablet van de persoon hoeft de hele familie-interface niet te
// downloaden. Die is groter dan haar eigen schermen samen.
const FamilyLayout = lazy(() => import("./app/FamilyLayout"));
const DashboardPage = lazy(() =>
  import("./features/family/FamilyPages").then((m) => ({
    default: m.DashboardPage,
  })),
);
const PeoplePage = lazy(() =>
  import("./features/family/FamilyPages").then((m) => ({
    default: m.PeoplePage,
  })),
);
const HomeMemoryPage = lazy(() =>
  import("./features/family/FamilyPages").then((m) => ({
    default: m.HomeMemoryPage,
  })),
);
const MemoriesPage = lazy(() =>
  import("./features/family/FamilyPages").then((m) => ({
    default: m.MemoriesPage,
  })),
);
const MessagesPage = lazy(() =>
  import("./features/family/FamilyPages").then((m) => ({
    default: m.MessagesPage,
  })),
);
const Settings = lazy(() => import("./features/settings/Settings"));
const Delen = lazy(() => import("./features/sharing/Delen"));
const ManageNotesPage = lazy(() =>
  import("./features/family/FamilyPages").then((m) => ({
    default: m.NotesPage,
  })),
);
const Onboarding = lazy(() => import("./features/onboarding/Onboarding"));
const Planning = lazy(() => import("./features/planning/Planning"));
const CareLog = lazy(() => import("./features/care-log/CareLog"));
const Documents = lazy(() => import("./features/documents/Documents"));
import { useHousehold } from "./features/household/useHousehold";
import { configuratieOk } from "./lib/supabase";
import ErrorBoundary from "./app/ErrorBoundary";
import SetupNeeded from "./app/SetupNeeded";
import { pasLokaalToe } from "./features/settings/useDisplayPrefs";
import "./index.css";


/** Wie niet ingelogd is, ziet het inlogscherm. Meer poortwachter is dit niet. */
function Beveiligd({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <p className="p-6 text-ink-soft">Even geduld…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** De rol bepaalt het scherm: 'person' komt nooit in de familie-interface. */
function Start() {
  const { household, all, isLoading } = useHousehold();
  if (isLoading) return <p className="p-6 text-ink-soft">Even geduld…</p>;
  // Wie nergens bij hoort, is nieuw: meteen naar de onboarding.
  if (all.length === 0) return <Navigate to="/start" replace />;
  // Het scherm hangt af van wie je bent, niet van je rol: wie de app zelf
  // gebruikt is ook beheerder, maar hoort het scherm van de persoon te zien.
  if (household && !household.is_self && household.role !== "person")
    return <Navigate to="/familie" replace />;
  return <PersonShell />;
}

// Voor React iets tekent: anders verspringt de tekstgrootte na een seconde.
pasLokaalToe();

// Terug online: probeer meteen opnieuw wat bleef hangen.
onlineManager.subscribe((online) => {
  if (online) queryClient.resumePausedMutations();
});

const root = ReactDOM.createRoot(document.getElementById("root")!);

// Zonder verbinding met Supabase heeft de rest geen zin. Dan tonen we
// wat er ontbreekt, in plaats van stil stuk te lopen.
if (!configuratieOk) {
  root.render(
    <React.StrictMode>
      <SetupNeeded />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60_000,
            // Bij een nieuwe versie van de app is de oude cache niet te
            // vertrouwen; buster gooit hem dan weg.
            buster: import.meta.env.VITE_BUILD_ID ?? "dev",
          }}
          onSuccess={() => {
            // Wat offline werd afgevinkt, gaat alsnog de deur uit.
            queryClient.resumePausedMutations();
          }}
        >
          <AuthProvider>
            <BrowserRouter>
              <OfflineBanner />
              <Suspense
                fallback={<p className="p-6 text-ink-soft">Even geduld…</p>}
              >
                <Routes>
                  <Route path="/login/*" element={<Welcome />} />
                  <Route path="/uitnodiging" element={<AcceptInvite />} />
                  <Route path="/installeren" element={<InstallGuide />} />
                  <Route
                    path="/start"
                    element={
                      <Beveiligd>
                        <Onboarding />
                      </Beveiligd>
                    }
                  />
                  <Route
                    element={
                      <Beveiligd>
                        <PersonLayout />
                      </Beveiligd>
                    }
                  >
                    <Route path="/" element={<Start />} />
                    <Route path="/persoon" element={<PersonShell />} />
                    <Route path="/wie" element={<WhoIsWho />} />
                    <Route path="/wie/:personId" element={<PersonDetail />} />
                    <Route path="/nu" element={<WhatNow />} />
                    <Route path="/praten" element={<Talk />} />
                    <Route path="/help" element={<Help />} />
              <Route
                path="/delen"
                element={
                  <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
                    <Delen />
                  </main>
                }
              />
                    <Route path="/memory" element={<MemoryHome />} />
                    <Route path="/fotos" element={<Photos />} />
                    <Route path="/weetjes" element={<Notes />} />
                    <Route
                      path="/memory/ding/:itemId"
                      element={<ItemDetail />}
                    />
                    <Route path="/memory/:roomId" element={<RoomItems />} />
                  </Route>
                  <Route
                    path="/familie"
                    element={
                      <Beveiligd>
                        <FamilyLayout />
                      </Beveiligd>
                    }
                  >
                    <Route index element={<DashboardPage />} />
                    <Route path="planning" element={<Planning />} />
                    <Route path="wie" element={<PeoplePage />} />
                    <Route path="huis" element={<HomeMemoryPage />} />
                    <Route path="fotos" element={<MemoriesPage />} />
                    <Route path="berichten" element={<MessagesPage />} />
                    <Route path="logboek" element={<CareLog />} />
                    <Route path="documenten" element={<Documents />} />
                    <Route path="weetjes" element={<ManageNotesPage />} />
                    <Route path="delen" element={<Delen />} />
              <Route path="instellingen" element={<Settings />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
