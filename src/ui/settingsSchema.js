/**
 * Opis ustawień (bez DOM) do ekranu ustawień: kategorie → opcje z tytułem, opisem działania i wyborami.
 * Klucze i wartości odpowiadają `DEFAULTS` z `Settings.js` (test pilnuje kompletności).
 * type 'radio': `choices` [{ value, label, hint? }]; type 'range': `range` { min, max, step } (wartość jako tekst).
 * `reload: true` – zmiana przeładowuje stronę (widok budowany od nowa).
 */
export const SETTINGS_CATEGORIES = [
  {
    id: 'stanowisko', kicker: 'Służba', title: 'Stanowisko obsługi',
    intro: 'Jakimi urządzeniami sterowania ruchem prowadzisz posterunek. Każda stacja ma stanowisko domyślne z definicji, ale możesz je zmienić.',
    options: [
      {
        key: 'srk', title: 'Urządzenia srk', reload: true,
        description: 'Pulpit kostkowy typu E to przyciski dwuprzyciskowe, lampki na kostkach i liczniki plombowane. Stanowisko komputerowe to obraz na monitorze (Ie-104): polecenia z paska i menu elementu, przebiegi złożone. Zmiana przeładowuje widok.',
        choices: [
          { value: 'auto', label: 'wg stacji', hint: 'stanowisko z definicji posterunku (misje wymuszają swoje)' },
          { value: 'E', label: 'pulpit kostkowy (typ E)', hint: 'urządzenia przekaźnikowe' },
          { value: 'komputerowe', label: 'komputerowe (monitor)', hint: 'obraz stanu na monitorze' },
        ],
      },
    ],
  },
  {
    id: 'pulpit', kicker: 'Widok', title: 'Pulpit',
    intro: 'Jak pulpit lub monitor układa się w oknie i co robi po powiększeniu.',
    options: [
      {
        key: 'deskPos', title: 'Położenie pulpitu w pionie',
        description: 'Gdy pulpit jest niższy niż okno, może stać u góry, na środku albo u dołu obszaru.',
        choices: [{ value: 'top', label: 'góra' }, { value: 'middle', label: 'środek' }, { value: 'bottom', label: 'dół' }],
      },
      {
        key: 'screens', title: 'Ekrany pulpitu',
        description: 'Szeroki posterunek dzieli się na ekrany mieszczące się w oknie (jak monitory w LCS); przełączasz je zakładkami „ekran” i strzałkami ← →. Bez podziału cały pulpit jest na jednym ekranie i trzeba go przewijać.',
        choices: [
          { value: 'auto', label: 'podział na ekrany wg szerokości okna' },
          { value: 'off', label: 'cały pulpit na jednym ekranie' },
        ],
      },
      {
        key: 'edgePanels', title: 'Stałe pola skrajne',
        description: 'Po powiększeniu ponad szerokość okna skrajne kolumny z blokadą liniową (strzałki szlaku, kostki Ko/Poz/Wbl) zostają przypięte po obu stronach za linią przerywaną, a środek przewijasz. Widać, co jedzie od sąsiada i co wyprawiono. Pola obsługują się jak pulpit. Na pasku „widok” pojawia się przycisk „wysokość”: wypełnia okno w pionie, środek przewijasz, blokada zostaje na brzegach.',
        choices: [
          { value: 'off', label: 'wyłączone' },
          { value: 'on', label: 'włączone', hint: 'skrajne kolumny przypięte do krawędzi okna, środek przewijany' },
        ],
      },
    ],
  },
  {
    id: 'monitor', kicker: 'Widok', title: 'Monitor',
    intro: 'Ustawienia stanowiska komputerowego. Nie mają wpływu na pulpit kostkowy.',
    options: [
      {
        key: 'symScale', title: 'Wielkość symboli i napisów', type: 'range', range: { min: 1, max: 1.5, step: 0.05 },
        description: 'Skala sygnalizatorów, numerów zwrotnic, kasetek numerów pociągów i opisów na monitorze. Tory i geometria zostają bez zmian.',
      },
      {
        key: 'rowScale', title: 'Odstęp torów', reload: true,
        description: 'Ciasny układ zbliża rzędy: semafory i tarcze stoją bliżej toru, plan jest niższy i lepiej mieści się na wąskim ekranie. Zmiana przeładowuje widok.',
        choices: [{ value: '1', label: 'normalny' }, { value: '0.7', label: 'ciasny', hint: 'semafory i tarcze bliżej toru' }],
      },
    ],
  },
  {
    id: 'wyglad', kicker: 'Wygląd', title: 'Motyw',
    intro: 'Kolory interfejsu wokół pulpitu. Kostki pulpitu i monitor mają własne, stałe kolory.',
    options: [
      {
        key: 'theme', title: 'Motyw interfejsu',
        description: 'Wg systemu – jasny lub ciemny za ustawieniem urządzenia, zmienia się razem z nim.',
        choices: [{ value: 'system', label: 'wg systemu operacyjnego' }, { value: 'dark', label: 'ciemny' }, { value: 'light', label: 'jasny' }],
      },
    ],
  },
  {
    id: 'panel', kicker: 'Widok', title: 'Panel boczny',
    intro: 'Rozkład jazdy, dziennik, stan, rozkazy i łączność. Panel można też zwinąć przyciskiem „ukryj” na pasku narzędzi.',
    options: [
      {
        key: 'sidePos', title: 'Położenie panelu',
        description: 'Po prawej lub po lewej panel zajmuje kolumnę obok pulpitu; na dole leży pod pulpitem na całą szerokość (wygodne na tablecie w poziomie).',
        choices: [{ value: 'right', label: 'po prawej' }, { value: 'left', label: 'po lewej' }, { value: 'bottom', label: 'na dole' }],
      },
    ],
  },
];

/** Klucze ustawień opisane w schemacie (do testu kompletności względem DEFAULTS). */
export function schemaKeys() {
  return SETTINGS_CATEGORIES.flatMap((c) => c.options.map((o) => o.key));
}
