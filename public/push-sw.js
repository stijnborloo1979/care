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

  const titel = data.titel || 'Thuis'
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
