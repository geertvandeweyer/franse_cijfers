# Oefeningen Franse Cijfers 🇧🇪

Browserapp om de getallen 1–1000 te oefenen in het Frans, met **Belgische notatie** (septante / nonante).

## Gebruik

```bash
cd Frans_cijfers
python3 -m http.server 8080
```
Open `http://localhost:8080` in Chrome of Edge.

> Openen als `file://` werkt voor de spellingmodus. De spraak-modus vereist een HTTP-server (Chrome vraagt anders elke keer opnieuw toestemming voor de microfoon).

## Modi

| Modus | Invoer | Controle |
|-------|--------|----------|
| ⌨️ Spelling | Typ het getal in het Frans | Exact (koppeltekens tellen) |
| 🎤 Spraak | Spreek het getal in | Fuzzy matching ≥ 80% |

## Belgische notatie

| Getal | Belgisch | Standaard FR |
|-------|----------|-------------|
| 70 | septante | soixante-dix |
| 80 | quatre-vingts | quatre-vingts |
| 90 | nonante | quatre-vingt-dix |

## Spaced repetition

- Fouten krijgen gewicht ×2 (max ×8) → komen vaker terug
- Correct → gewicht ×0.7
- 3× op rij correct → gewicht reset naar normaal
- Bij fout worden vergelijkbare getallen (zelfde decennium) ook licht geboost
- Voortgang wordt opgeslagen in `localStorage`

## Bestanden

```
index.html          hoofdpagina
css/style.css       opmaak
js/numbers.js       toFrenchBelgian(n) — getalomzetting
js/repetition.js    RepetitionTracker — gewogen selectie
js/recognition.js   SpeechChecker — Web Speech API + Levenshtein
js/app.js           controller
```

## Licentie

MIT — vrij te gebruiken en aan te passen.  
Auteur: Geert Vandeweyer — geertvandeweyer@gmail.com — mei 2026
