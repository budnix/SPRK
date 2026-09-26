/**
 * Rejestr typów kostek pulpitu.
 *
 * Każdy typ kostki opisuje:
 *  - `category`  – 'track' (kostka torowa), 'signal' (powtarzacz sygnalizatora),
 *                  'control' (przyciski, liczniki), 'block' (blokada liniowa),
 *                  'label' (opis), 'blank' (pusta)
 *  - `ports(tile)` – lista portów torowych, którymi kostka łączy się z sąsiadami
 *  - `exits(tile, inPort, state)` – możliwe porty wyjścia po wejściu portem `inPort`;
 *                  dla zwrotnic zależy od położenia (`state.position`)
 *  - `schema`    – opis pól konfiguracyjnych (dla przyszłego edytora)
 *
 * Nowe typy kostek dodaje się przez `registerTile(...)`; renderer i topologia
 * korzystają wyłącznie z rejestru, więc dodanie typu nie wymaga zmian w rdzeniu.
 */
const REGISTRY = new Map();

export function registerTile(def) {
  if (!def.type) throw new Error('Definicja kostki wymaga pola `type`');
  if (REGISTRY.has(def.type)) throw new Error(`Typ kostki '${def.type}' już zarejestrowany`);
  REGISTRY.set(def.type, Object.freeze({ category: 'blank', span: { w: 1, h: 1 }, ...def }));
  return def;
}

export function getTileDef(type) {
  const d = REGISTRY.get(type);
  if (!d) throw new Error(`Nieznany typ kostki: '${type}'`);
  return d;
}

export function hasTileDef(type) {
  return REGISTRY.has(type);
}

export function listTileDefs() {
  return [...REGISTRY.values()];
}

/* ------------------------------------------------------------------ */
/* Kostki torowe                                                        */
/* ------------------------------------------------------------------ */

/**
 * Zwykła kostka torowa: dwa porty (prosty, skos, łuk).
 * Przykłady: ['W','E'] – prosty; ['SW','NE'] – skos; ['SW','E'] – łuk.
 * Może nieść dodatki: wykolejnicę (`derailer`), przycisk końca przebiegu (`endButton`),
 * opis (`text`), izolację (`joints`).
 */
registerTile({
  type: 'track',
  category: 'track',
  title: 'Kostka torowa',
  schema: {
    ports: { type: 'ports', count: 2, required: true },
    section: { type: 'string', required: true, doc: 'Identyfikator odcinka izolowanego' },
    derailer: { type: 'string', doc: 'Id wykolejnicy umieszczonej na tej kostce' },
    endButton: { type: 'object', doc: '{ id, color } – przycisk końca przebiegu' },
    text: { type: 'string', doc: 'Opis (np. numer toru)' },
  },
  ports: (t) => t.ports,
  exits: (t, inPort) => t.ports.filter((p) => p !== inPort),
});

/**
 * Kozioł oporowy: jeden port. Tor kończy się na tej kostce.
 */
registerTile({
  type: 'buffer',
  category: 'track',
  title: 'Kozioł oporowy',
  schema: {
    port: { type: 'port', required: true },
    section: { type: 'string', required: true },
    endButton: { type: 'object' },
  },
  ports: (t) => [t.port],
  exits: () => [],
});

/**
 * Zwrotnica: trzy porty – ostrze (`toe`), tor zasadniczy (`straight`, położenie „+”)
 * i tor zwrotny (`diverge`, położenie „−”).
 */
registerTile({
  type: 'point',
  category: 'track',
  title: 'Zwrotnica',
  schema: {
    id: { type: 'string', required: true },
    toe: { type: 'port', required: true },
    straight: { type: 'port', required: true },
    diverge: { type: 'port', required: true },
    section: { type: 'string', required: true },
    speedDiverging: { type: 'number', default: 40, doc: 'Prędkość na tor zwrotny [km/h]' },
    label: { type: 'string' },
  },
  ports: (t) => [t.toe, t.straight, t.diverge],
  exits: (t, inPort, state) => {
    const pos = state?.position ?? '+';
    if (inPort === t.toe) return [pos === '+' ? t.straight : t.diverge];
    if (inPort === t.straight) return [t.toe];
    if (inPort === t.diverge) return [t.toe];
    return [];
  },
  /** Który port jest „legem” wymaganym dla danej pary wejście/wyjście. */
  requiredPosition: (t, inPort, outPort) => {
    const leg = inPort === t.toe ? outPort : inPort;
    if (leg === t.straight) return '+';
    if (leg === t.diverge) return '-';
    return null;
  },
});

/**
 * Skrzyżowanie torów (bez połączeń): dwie niezależne pary portów.
 */
registerTile({
  type: 'crossing',
  category: 'track',
  title: 'Skrzyżowanie torów',
  schema: {
    pairs: { type: 'array', required: true, doc: '[[a,b],[c,d]]' },
    section: { type: 'string', required: true },
  },
  ports: (t) => t.pairs.flat(),
  exits: (t, inPort) => {
    const pair = t.pairs.find((p) => p.includes(inPort));
    return pair ? pair.filter((p) => p !== inPort) : [];
  },
});

/* ------------------------------------------------------------------ */
/* Powtarzacze sygnalizatorów                                            */
/* ------------------------------------------------------------------ */

/**
 * Powtarzacz sygnalizatora z przyciskami sygnałowymi. Kostka nie jest torowa –
 * odnosi się do kostki torowej `at` i kierunku jazdy `dir` (E/W), w którym
 * sygnalizator jest ważny (stoi na granicy wyjścia z kostki `at` w kierunku `dir`).
 */
registerTile({
  type: 'signal',
  category: 'signal',
  title: 'Powtarzacz sygnalizatora',
  schema: {
    id: { type: 'string', required: true },
    kind: { type: 'enum', values: ['semafor', 'tm'], required: true, doc: 'semafor lub tarcza manewrowa' },
    at: { type: 'xy', required: true, doc: 'Kostka torowa, przy której stoi sygnalizator' },
    dir: { type: 'enum', values: ['E', 'W'], required: true, doc: 'Kierunek jazdy, dla którego sygnalizator jest ważny' },
    shunting: { type: 'boolean', default: false, doc: 'Semafor z sygnałem Ms2 (przycisk biały)' },
    substitute: { type: 'boolean', default: true, doc: 'Możliwość podania sygnału zastępczego Sz' },
    overlap: { type: 'boolean', default: true, doc: 'Wymagana droga ochronna za semaforem' },
    entry: { type: 'boolean', default: false, doc: 'Semafor wjazdowy (z tarczą ostrzegawczą)' },
  },
  ports: () => [],
  exits: () => [],
});

/* ------------------------------------------------------------------ */
/* Kostki sterownicze                                                  */
/* ------------------------------------------------------------------ */

/**
 * Przycisk grupowy / specjalny z opisem i opcjonalnym licznikiem.
 * role: 'group-point' (Zw), 'point-lock' (Zz), 'route-release' (Pz),
 *       'emergency-release' (dPz, licznik), 'substitute' (Sz, licznik),
 *       'custom'
 */
registerTile({
  type: 'button',
  category: 'control',
  title: 'Przycisk',
  schema: {
    id: { type: 'string', required: true },
    label: { type: 'string', required: true },
    role: { type: 'enum', values: ['group-point', 'point-lock', 'route-release', 'emergency-release', 'substitute', 'custom'], required: true },
    color: { type: 'enum', values: ['grey', 'black', 'green', 'white', 'red', 'yellow', 'blue'], default: 'grey' },
    counter: { type: 'boolean', default: false, doc: 'Przycisk plombowany z licznikiem' },
  },
  ports: () => [],
  exits: () => [],
});

/** Opis (np. nazwa toru, nazwa stacji). */
registerTile({
  type: 'label',
  category: 'label',
  title: 'Opis',
  schema: {
    text: { type: 'string', required: true },
    size: { type: 'number', default: 10 },
    span: { type: 'number', default: 1 },
  },
  ports: () => [],
  exits: () => [],
});

/** Pusta kostka. */
registerTile({ type: 'blank', category: 'blank', title: 'Pusta kostka', ports: () => [], exits: () => [] });
