import type { Vertaling } from '../uiTaal'

/** Wonen in een WZC: hulpvragen aan de afdeling en wat er pauzeert (109). */
export default {
  fr: {
    "Hulpvragen van bewoners": "Demandes d'aide des résidents",
    "{naam} vraagt hulp": "{naam} demande de l'aide",
    "Ik ga": "J'y vais",
    "Dat lukte niet. Probeer het opnieuw.": "Cela n'a pas fonctionné. Réessayez.",
    "net nu": "à l'instant",
    "{n} min geleden": "il y a {n} min",
    "{u} u {n} min geleden": "il y a {u} h {n} min",
    "{u} u geleden": "il y a {u} h",
    "{n}e keer gevraagd": "demandé {n} fois",
    "Gepauzeerd zolang {voornaam} in {wzc} woont. Er wordt geen locatie bewaard en er komt geen melding over de veilige zone. Na het verblijf werkt het weer zoals ingesteld.":
      "En pause tant que {voornaam} habite à {wzc}. Aucune position n'est enregistrée et aucune alerte de zone sûre n'est envoyée. Après le séjour, tout reprend comme configuré.",
  },
  en: {
    "Hulpvragen van bewoners": "Help requests from residents",
    "{naam} vraagt hulp": "{naam} is asking for help",
    "Ik ga": "I'm going",
    "Dat lukte niet. Probeer het opnieuw.": "That didn't work. Please try again.",
    "net nu": "just now",
    "{n} min geleden": "{n} min ago",
    "{u} u {n} min geleden": "{u} h {n} min ago",
    "{u} u geleden": "{u} h ago",
    "{n}e keer gevraagd": "asked {n} times",
    "Gepauzeerd zolang {voornaam} in {wzc} woont. Er wordt geen locatie bewaard en er komt geen melding over de veilige zone. Na het verblijf werkt het weer zoals ingesteld.":
      "Paused while {voornaam} lives at {wzc}. No location is stored and no safe-zone alerts are sent. After the stay, it works again as configured.",
  },
} satisfies Vertaling
