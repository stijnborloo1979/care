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
      // Eén melding per soort: tien keer dezelfde waarschuwing op het
      // vergrendelscherm helpt niemand.
      tag: data.level === 'alert' ? 'thuis-alert' : 'thuis-melding',
      renotify: data.level === 'alert',
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
