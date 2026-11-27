package be.lifeangle.ledbalk;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Philips SICP: het protocol waarmee Philips-signageschermen zich laten
 * bedienen, over TCP-poort 5000.
 *
 * Bericht: [lengte] [monitor 01] [groep 00] [commando] [data...] [xor]
 * Ledstrip zetten is commando F3 met [aan/uit] [R] [G] [B].
 * Getest op een 10BDL4551T met: 09 01 00 F3 01 00 00 FF 05 (blauw).
 */
final class Sicp {
    private static final int POORT = 5000;
    private static String werkendAdres = null;

    private Sicp() {}

    static byte[] ledBericht(boolean aan, int r, int g, int b) {
        byte[] m = new byte[9];
        m[0] = 9;
        m[1] = 0x01;
        m[2] = 0x00;
        m[3] = (byte) 0xF3;
        m[4] = (byte) (aan ? 1 : 0);
        m[5] = (byte) r;
        m[6] = (byte) g;
        m[7] = (byte) b;
        byte x = 0;
        for (int i = 0; i < 8; i++) x ^= m[i];
        m[8] = x;
        return m;
    }

    /** Stuurt het bericht naar het scherm zelf. Probeert eerst het adres dat de vorige keer werkte. */
    static synchronized boolean stuur(byte[] bericht) {
        List<String> adressen = new ArrayList<>();
        if (werkendAdres != null) adressen.add(werkendAdres);
        adressen.add("127.0.0.1");
        adressen.addAll(eigenAdressen());

        for (String adres : adressen) {
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress(adres, POORT), 1500);
                s.setSoTimeout(1500);
                OutputStream uit = s.getOutputStream();
                uit.write(bericht);
                uit.flush();
                // Het scherm antwoordt met een bevestiging; even lezen zodat
                // het bericht niet afgebroken wordt door het sluiten.
                try {
                    InputStream in = s.getInputStream();
                    byte[] buf = new byte[32];
                    in.read(buf);
                } catch (Exception ignored) {
                    // geen antwoord is ook goed
                }
                werkendAdres = adres;
                return true;
            } catch (Exception e) {
                if (adres.equals(werkendAdres)) werkendAdres = null;
            }
        }
        return false;
    }

    private static List<String> eigenAdressen() {
        List<String> lijst = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address) lijst.add(a.getHostAddress());
                }
            }
        } catch (Exception ignored) {
            // geen netwerk: dan blijft alleen 127.0.0.1 over
        }
        return lijst;
    }
}
