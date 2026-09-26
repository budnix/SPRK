# SPRK – wskazówki dla Claude Code

## Commity i pull requesty

- **Nie dodawaj żadnych stopek ani wzmianek** do commitów i PR-ów: bez `Co-Authored-By`, bez `Claude-Session`,
  bez „Generated with Claude Code”, bez linków do sesji, bez nazw modeli. Treść commita to tylko opis zmiany.
- Komunikaty commitów po polsku, w trybie oznajmującym, pierwsza linia do ~70 znaków.
- Pracuj bezpośrednio na `main`, chyba że użytkownik poprosi o gałąź.
- Przed pushem: `npm test` musi przechodzić.

## Projekt

- Czysty JavaScript (moduły ES), bez frameworków. Vite tylko jako serwer dev/build. Testy: `node --test`.
- Logika symulacji (`src/model/`) nie może zależeć od DOM – testy działają w Node.
- Nowe kostki pulpitu: wpis w `src/tiles/registry.js` + funkcja rysująca w `src/render/tileArt.js`.
- Definicje stacji wg `docs/STATION-FORMAT.md`; walidacja w `src/model/validate.js`.
- Terminologia kolejowa po polsku, zgodnie z Ie-1 / Ir-1 (semafor, tarcza manewrowa, przebieg, utwierdzenie,
  odcinek zbliżania, droga ochronna, blokada liniowa Eap).
