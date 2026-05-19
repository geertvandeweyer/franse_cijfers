# Oefeningen Franse Cijfers 🇧🇪

Browserapp om de getallen 1–1000 te oefenen in het Frans, met **Belgische notatie** (septante / nonante).
Drie oefenmodi, spaced repetition en een scorebord per modus.

---

## Modi

| Modus | Wat je doet | Controle |
|-------|-------------|----------|
| ⌨️ Spelling | Typ het getal in het Frans | Exact (koppeltekens tellen) |
| 🎤 Spraak | Spreek het getal in het Frans | Fuzzy matching ≥ 80% (Levenshtein) |
| 🔊 Luisteren | Hoor het getal via TTS, typ het cijfer | Exact getal |

Spraak en Luisteren vereisen microfoon / audio — Chrome of Edge aanbevolen.

Getest op Linux/Chrome, Windows/Chrome|Edge en Android/Chrome

---

## Deployment

### Public

[https://chiffres.geertvandeweyer.be](https://chiffres.geertvandeweyer.be)

### Lokaal (zonder scorebord)

```bash
cd Frans_cijfers
python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome of Edge.
Het scorebord werkt **niet** in lokale modus (geen PHP).

### Apache + PHP (met scorebord)

Vereisten: Apache 2, PHP 7+.

```bash
# kopieer bestanden naar de webroot
cp -r franse_cijfers/* /var/www/html/fr-cijfers/

# maak stats.txt aan en geef schrijfrechten aan de webserver
touch /var/www/html/fr-cijfers/api/stats.txt
chown www-data:www-data /var/www/html/fr-cijfers/api/stats.txt
chmod 664 /var/www/html/fr-cijfers/api/stats.txt
```

`stats.txt` wordt door `api/stats.php` gebruikt om topscores op te slaan.
Zonder schrijfrechten werkt het scorebord niet (de app toont dan geen fout, scores worden alleen niet opgeslagen).

---

## Scorebord

- Per modus een aparte top-10 (Spelling / Spraak / Luisteren).
- Naam wordt gevraagd zodra je een reeks van **≥ 5** opeenvolgend correcte antwoorden behaalt.
- Herpoging na fout telt als correct maar verhoogt de reeks **niet**.
- Scores worden opgeslagen in `api/stats.txt` (JSON) via `api/stats.php`.

---

## Belgische notatie

| Getal | Belgisch | Standaard FR |
|-------|----------|-------------|
| 70 | septante | soixante-dix |
| 80 | quatre-vingts | quatre-vingts |
| 90 | nonante | quatre-vingt-dix |

---

## Spaced repetition

- Fout → gewicht ×2 (max ×8) → getal komt vaker terug
- Correct → gewicht ×0.7 (min 0.5)
- Bij fout worden getallen uit hetzelfde tiental licht geboost
- Voortgang opgeslagen in `localStorage` (browser, blijft tussen sessies)

---

## Bestanden

```
index.html              hoofdpagina
css/style.css           opmaak
js/numbers.js           toFrenchBelgian(n) — getalomzetting
js/repetition.js        RepetitionTracker — gewogen selectie
js/recognition.js       SpeechChecker — Web Speech API + TTS
js/app.js               controller (drie modi, scorebord, spaced repetition)
api/stats.php           REST-endpoint voor scorebord (PHP 7+)
api/stats.txt           scoreopslag (JSON, door webserver beschrijfbaar maken)
```

---

## Licentie

MIT — vrij te gebruiken en aan te passen.
Auteur: Geert Vandeweyer — geertvandeweyer@gmail.com — mei 2026
Repository: https://github.com/geertvandeweyer/franse_cijfers
