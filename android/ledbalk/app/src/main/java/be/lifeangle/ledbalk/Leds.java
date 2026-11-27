package be.lifeangle.ledbalk;

/**
 * Houdt bij welke kleur de leds hebben, en laat ze desgevraagd rustig
 * knipperen. Eén draad tegelijk: een nieuw commando stopt het vorige.
 */
final class Leds {
    private static Thread knipper = null;
    static volatile String stand = "uit";

    private Leds() {}

    static synchronized boolean zet(int r, int g, int b, boolean knipperen) {
        stopKnipperen();
        stand = String.format("%02x%02x%02x%s", r, g, b, knipperen ? "-knipper" : "");
        if (!knipperen) return Sicp.stuur(Sicp.ledBericht(true, r, g, b));

        final byte[] aan = Sicp.ledBericht(true, r, g, b);
        final byte[] uit = Sicp.ledBericht(false, 0, 0, 0);
        boolean gelukt = Sicp.stuur(aan);
        knipper = new Thread(() -> {
            boolean licht = true;
            // Traag: een snel knipperend licht schrikt af.
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    Thread.sleep(900);
                } catch (InterruptedException e) {
                    return;
                }
                licht = !licht;
                Sicp.stuur(licht ? aan : uit);
            }
        });
        knipper.setDaemon(true);
        knipper.start();
        return gelukt;
    }

    static synchronized boolean uit() {
        stopKnipperen();
        stand = "uit";
        return Sicp.stuur(Sicp.ledBericht(false, 0, 0, 0));
    }

    private static void stopKnipperen() {
        if (knipper != null) {
            knipper.interrupt();
            knipper = null;
        }
    }
}
