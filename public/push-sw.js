// Wordt door Workbox in de service worker geladen (zie vite.config.ts).
// Alleen het ontvangen en openen van een pushbericht; al de rest van de
// service worker wordt gegenereerd.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const titel = data.titel || 'LifeAngle'
  const body = data.body || 'Er is iets dat je aandacht vraagt.'

  event.waitUntil(
    self.registration.showNotification(titel, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Eén regel per soort op het vergrendelscherm: tien keer dezelfde
      // waarschuwing onder elkaar helpt niemand. De tag zorgt daarvoor —
      // een nieuwe melding vervangt de vorige in plaats van erbij te komen.
      tag: data.level === 'alert' ? 'thuis-alert' : 'thuis-melding',
      // Maar wel opnieuw laten merken, en dat is het verschil.
      //
      // Zonder renotify vervangt een tweede melding met dezelfde tag de
      // eerste in stilte: geen geluid, geen trilling, geen banner. Wie twee
      // keer vroeg of je belt, kreeg dus één keer een signaal en daarna
      // niets meer — terwijl juist de tweede keer zegt dat het dringender
      // wordt. Alleen bij 'info' en 'ok' blijft het stil: dat zijn berichten
      // die mogen wachten tot je toch kijkt.
      renotify: data.level === 'alert' || data.level === 'warn',
      // Geluid en trilling.
      //
      // De webstandaard laat niet toe een eigen geluid te kiezen — dat
      // bepaalt het toestel, in zijn eigen meldingsinstellingen. Wat wij wel
      // kunnen is erom vragen: silent op false betekent "gebruik het gewone
      // meldingsgeluid". Standaard is dat al zo, maar expliciet is hier beter,
      // want het is precies het veld dat iemand ooit op true zet om iets
      // anders op te lossen.
      //
      // Komt er geen geluid, dan zit het bij de instellingen van het toestel
      // en niet hier. Zie de README.
      silent: data.level === 'info' || data.level === 'ok',
      // Trillen bij wat niet kan wachten. Een patroon met stiltes erin valt
      // meer op dan één lange tril, en Android honoreert dit nog; sommige
      // andere browsers negeren het zonder klagen.
      vibrate:
        data.level === 'alert'
          ? [200, 100, 200, 100, 400]
          : data.level === 'warn'
            ? [200, 100, 200]
            : undefined,
      // "Ik heb hulp nodig" blijft op het scherm tot iemand hem wegklikt.
      // Een melding die na vijf seconden vanzelf verdwijnt terwijl je net
      // even niet keek, is geen melding.
      requireInteraction: data.level === 'alert',
      data: { url: data.url || '/familie' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/familie'

  // Staat de app al open, dan daarheen springen in plaats van een tweede
  // tabblad te openen.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lijst) => {
      for (const client of lijst) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
