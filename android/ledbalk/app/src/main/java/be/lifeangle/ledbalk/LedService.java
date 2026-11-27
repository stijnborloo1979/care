package be.lifeangle.ledbalk;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Een piepkleine webserver, alleen bereikbaar op het toestel zelf
 * (127.0.0.1:8765). LifeAngle in de browser roept hem aan; hij zet de leds.
 *
 *   GET /status                      → {"ok":true,...}
 *   GET /led?kleur=0050ff            → vaste kleur
 *   GET /led?kleur=00c050&knipper=1  → rustig knipperen
 *   GET /led?kleur=uit               → leds uit
 *
 * Alleen op 127.0.0.1: niemand anders op het netwerk kan de leds bedienen.
 */
public class LedService extends Service {
    static final int POORT = 8765;
    private static final String KANAAL = "ledbalk";
    private Thread server;
    private ServerSocket socket;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        toonMelding();
        if (server == null) {
            server = new Thread(this::luister, "ledbalk-server");
            server.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {
        }
        server = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void toonMelding() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(KANAAL, "Ledbalk", NotificationManager.IMPORTANCE_MIN));
            b = new Notification.Builder(this, KANAAL);
        } else {
            b = new Notification.Builder(this);
        }
        Notification n = b.setContentTitle("LifeAngle Ledbalk")
                .setContentText("Klaar om de leds aan te sturen")
                .setSmallIcon(android.R.drawable.star_on)
                .setOngoing(true)
                .build();
        startForeground(1, n);
    }

    private void luister() {
        try {
            socket = new ServerSocket(POORT, 10, InetAddress.getByName("127.0.0.1"));
            while (!socket.isClosed()) {
                Socket s = socket.accept();
                new Thread(() -> behandel(s)).start();
            }
        } catch (Exception ignored) {
            // poort bezet of server gesloten
        }
    }

    private void behandel(Socket s) {
        try (Socket client = s) {
            client.setSoTimeout(3000);
            BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
            String regel = in.readLine();
            if (regel == null) return;
            String[] delen = regel.split(" ");
            String methode = delen.length > 0 ? delen[0] : "";
            String pad = delen.length > 1 ? delen[1] : "/";
            // De rest van de koppen lezen tot de lege regel.
            String kop;
            while ((kop = in.readLine()) != null && !kop.isEmpty()) {
                // niets mee te doen
            }

            OutputStream uit = client.getOutputStream();
            if (methode.equals("OPTIONS")) {
                antwoord(uit, 204, "");
                return;
            }

            String route = pad.contains("?") ? pad.substring(0, pad.indexOf('?')) : pad;
            Map<String, String> q = parameters(pad);

            if (route.equals("/status")) {
                antwoord(uit, 200, "{\"ok\":true,\"versie\":1,\"stand\":\"" + Leds.stand + "\"}");
            } else if (route.equals("/led")) {
                String kleur = q.getOrDefault("kleur", "uit");
                boolean gelukt;
                if (kleur.equals("uit") || kleur.length() != 6) {
                    gelukt = Leds.uit();
                } else {
                    int r = Integer.parseInt(kleur.substring(0, 2), 16);
                    int g = Integer.parseInt(kleur.substring(2, 4), 16);
                    int b = Integer.parseInt(kleur.substring(4, 6), 16);
                    gelukt = Leds.zet(r, g, b, "1".equals(q.get("knipper")));
                }
                antwoord(uit, gelukt ? 200 : 502, "{\"ok\":" + gelukt + "}");
            } else {
                antwoord(uit, 404, "{\"ok\":false}");
            }
        } catch (Exception ignored) {
            // een kapot verzoek mag de server niet stoppen
        }
    }

    private static Map<String, String> parameters(String pad) {
        Map<String, String> q = new HashMap<>();
        int i = pad.indexOf('?');
        if (i < 0) return q;
        for (String paar : pad.substring(i + 1).split("&")) {
            int j = paar.indexOf('=');
            if (j > 0) q.put(paar.substring(0, j), paar.substring(j + 1));
        }
        return q;
    }

    private static void antwoord(OutputStream uit, int code, String body) throws Exception {
        byte[] data = body.getBytes(StandardCharsets.UTF_8);
        String status = code == 200 ? "OK" : code == 204 ? "No Content" : "Error";
        // CORS, en de toestemming die Chrome vraagt voor een verzoek van een
        // website naar het eigen toestel (Private Network Access).
        String kop = "HTTP/1.1 " + code + " " + status + "\r\n"
                + "Content-Type: application/json\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: *\r\n"
                + "Access-Control-Allow-Private-Network: true\r\n"
                + "Cache-Control: no-store\r\n"
                + "Content-Length: " + data.length + "\r\n"
                + "Connection: close\r\n\r\n";
        uit.write(kop.getBytes(StandardCharsets.US_ASCII));
        uit.write(data);
        uit.flush();
    }
}
