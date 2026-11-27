package be.lifeangle.ledbalk;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Eén scherm om te zien dat het werkt. Daarna mag het dicht: de dienst
 * draait verder en start vanzelf na een herstart.
 */
public class MainActivity extends Activity {
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent dienst = new Intent(this, LedService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(dienst);
        else startService(dienst);

        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER_HORIZONTAL);
        l.setPadding(48, 64, 48, 48);

        TextView titel = new TextView(this);
        titel.setText("LifeAngle Ledbalk");
        titel.setTextSize(28);
        l.addView(titel);

        TextView uitleg = new TextView(this);
        uitleg.setText("Deze app draait op de achtergrond en laat LifeAngle de leds aansturen. "
                + "Test hieronder de kleuren. Daarna mag je dit scherm sluiten.");
        uitleg.setTextSize(18);
        uitleg.setPadding(0, 24, 0, 24);
        l.addView(uitleg);

        status = new TextView(this);
        status.setTextSize(18);
        l.addView(status);

        l.addView(knop("Blauw (bericht)", Color.rgb(0, 80, 255), () -> Leds.zet(0, 80, 255, false)));
        l.addView(knop("Oranje (herinnering)", Color.rgb(255, 120, 0), () -> Leds.zet(255, 120, 0, false)));
        l.addView(knop("Groen knipperend (oproep)", Color.rgb(0, 192, 80), () -> Leds.zet(0, 192, 80, true)));
        l.addView(knop("Uit", Color.DKGRAY, Leds::uit));

        setContentView(l);
    }

    private Button knop(String tekst, int kleur, Actie actie) {
        Button b = new Button(this);
        b.setText(tekst);
        b.setTextSize(20);
        b.setTextColor(Color.WHITE);
        b.setBackgroundColor(kleur);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        p.topMargin = 24;
        b.setLayoutParams(p);
        b.setOnClickListener(v -> new Thread(() -> {
            boolean gelukt = actie.doe();
            runOnUiThread(() -> status.setText(gelukt
                    ? "Gelukt."
                    : "Het scherm antwoordt niet op poort 5000. Staat netwerkbediening (SICP) aan?"));
        }).start());
        return b;
    }

    interface Actie {
        boolean doe();
    }
}
