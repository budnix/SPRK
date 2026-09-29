import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/model/Simulation.js';
import { getSrk } from '../src/srk/registry.js';
import { EBI_COMMANDS, SPECIAL_WINDOW } from '../src/srk/ebilock.js';
import szkolna from '../src/stations/szkolna.js';
import { run } from './helpers.js';

/* Stanowisko komputerowe EBILock 950 z pulpitem EBIScreen 3 (instrukcja obsługi LIRK) – linia poleceń, wybór myszą,
   polecenia specjalne dwuczęściowe, okno zdarzeń i alarmów. */

const ebi = (opts = {}) => new Simulation(szkolna, { srk: 'ebilock', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00' }, ...opts });

test('EBILock w rejestrze: widok „ebi”, protokół z linią poleceń; inne stanowiska linii poleceń nie mają', () => {
  const srk = getSrk('ebilock');
  assert.equal(srk.view, 'ebi');
  const sim = ebi();
  assert.equal(typeof sim.input.submit, 'function');
  const e = new Simulation(szkolna, { scenario: 'zmiana-e', disruptions: 'none' });
  assert.equal(e.submitCommand('ZWP Zw1').ok, false);
  // wykaz poleceń z instrukcji (bez ZWB/ZBP/ZBM, ZRI/ZRK, SZN – poza grą)
  const codes = EBI_COMMANDS.map((c) => c.code);
  for (const c of ['ITS', 'ITO', 'ZWP', 'ZWM', 'ZWS', 'ZWO', 'SES', 'SEO', 'PZW', 'KZW', 'SZI', 'SZW', 'POC', 'MAN', 'PZA', 'SSS', 'SSO', 'SZO']) assert.ok(codes.includes(c), c);
});

test('linia poleceń: POC A D1 nastawia przebieg, ZWP / ZWM przestawia zwrotnicę; nieznane polecenie i obiekt – odmowa', () => {
  const sim = ebi();
  const pt = sim.ilk.routes.get('A-D2').points.find((q) => q.position === '-').id;
  assert.ok(sim.submitCommand(`ZWM ${pt}`).ok);
  run(sim, 6);
  assert.equal(sim.ilk.points.get(pt).position, '-');
  assert.ok(sim.submitCommand(`zwp ${pt}`).ok, 'wielkość liter bez znaczenia');
  run(sim, 6);
  assert.equal(sim.ilk.points.get(pt).position, '+');
  assert.ok(sim.submitCommand('POC A D1').ok);
  run(sim, 8);
  assert.ok(sim.ilk.active.has('A-D1'));
  assert.match(sim.submitCommand('XYZ A').reason, /Nieznane polecenie/);
  assert.match(sim.submitCommand('SES Q9').reason, /nieznany obiekt/);
  assert.match(sim.submitCommand('POC A').reason, /początek i koniec/);
  assert.match(sim.submitCommand('').reason, /pusta/);
  // polecenie nie dla tego rodzaju obiektu
  assert.equal(sim.submitCommand('SZI Tm1').ok, false);
});

test('mysz: lewy klawisz – początek, prawy – koniec i menu przebiegu; prawy na obiekcie – menu obiektu; Wyczyść', () => {
  const sim = ebi();
  const p = sim.input;
  assert.ok(sim.press({ kind: 'signal', id: 'A', color: 'green' }).ok);
  assert.deepEqual(p.armed.selection, [{ kind: 'signal', id: 'A' }]);
  assert.equal(p.armed.role, 'route');
  assert.ok(sim.pull({ kind: 'signal', id: 'D1' }).ok);
  const menu = p.menu();
  assert.deepEqual(menu.map((m) => m.text), ['POC A D1', 'PZA A D1']);
  // wybór z menu wpisuje polecenie do linii (widok); wysłanie dopiero „Wykonaj”
  assert.equal(sim.ilk.active.size + sim.ilk.pending.length, 0, 'bez „Wykonaj” nic się nie dzieje');
  assert.ok(sim.submitCommand(menu[0].text).ok);
  assert.equal(p.armed, null, 'po wysłaniu wybór znika');
  // prawy klawisz na zwrotnicy: menu poleceń zwrotnicy
  sim.pull({ kind: 'point', id: 'Zw1' });
  assert.equal(p.armed.role, 'object');
  assert.deepEqual(p.menu().map((m) => m.code), ['ZWP', 'ZWM', 'ZWS', 'ZWO']);
  p.cancel();
  assert.equal(p.armed, null);
  assert.deepEqual(p.menu(), []);
  // semafor: także SZI; tarcza manewrowa – bez sygnału zastępczego
  sim.pull({ kind: 'signal', id: 'A' });
  assert.ok(p.menu().some((m) => m.code === 'SZI'));
  const tm = [...sim.ilk.signals.values()].find((s) => s.kind === 'tm').id;
  sim.pull({ kind: 'signal', id: tm });
  assert.ok(!p.menu().some((m) => m.code === 'SZI'));
  // koniec toru przy wyjeździe – polecenia blokady
  const kW = sim.ilk.topo.endButtons.has('kW') ? 'kW' : [...sim.ilk.topo.endButtons.keys()][0];
  sim.pull({ kind: 'end', id: kW });
  assert.ok(p.menu().some((m) => m.code === 'POZ'));
});

test('polecenie specjalne: SZI markuje semafor, SZW przyjęte tylko od 5 do 30 s po SZI', () => {
  const sim = ebi();
  const p = sim.input;
  assert.match(sim.submitCommand('SZW B').reason, /najpierw polecenie inicjujące/);
  assert.deepEqual(sim.submitCommand('SZI B'), { ok: true, marked: true });
  assert.equal(p.marks.get('signal:B').color, 'red');
  run(sim, SPECIAL_WINDOW.min - 1);
  assert.match(sim.submitCommand('SZW B').reason, /najwcześniej/, 'za wcześnie');
  assert.ok(p.marks.has('signal:B'), 'znacznik zostaje po zbyt wczesnym SZW');
  run(sim, 2);
  assert.ok(sim.submitCommand('SZW B').ok);
  assert.equal(sim.ilk.signals.get('B').aspect, 'Sz');
  assert.equal(sim.ilk.counters.Sz, 1);
  assert.equal(p.marks.has('signal:B'), false);
  // za późno: po 30 s znacznik wygasa
  sim.submitCommand('SZO STACJA'.replace('STACJA', szkolna.id));
  assert.ok(sim.submitCommand('SZI B').ok);
  run(sim, SPECIAL_WINDOW.max + 1);
  assert.equal(p.marks.has('signal:B'), false);
  assert.equal(sim.submitCommand('SZW B').ok, false);
});

test('polecenia stacji i sygnalizatora: SSS / SSO po nazwie stacji, SES / SEO, ZWS / ZWO, ITS / ITO', () => {
  const sim = ebi();
  assert.ok(sim.submitCommand(`SSS ${szkolna.name}`).ok);
  assert.equal(sim.ilk.allStop, true);
  assert.ok(sim.submitCommand(`SSO ${szkolna.id}`).ok);
  assert.equal(sim.ilk.allStop, false);
  assert.ok(sim.submitCommand('SES A').ok);
  assert.equal(sim.ilk.signals.get('A').stopped, true);
  assert.ok(sim.submitCommand('SEO A').ok);
  assert.ok(sim.submitCommand('ZWS Zw1').ok);
  assert.equal(sim.ilk.points.get('Zw1').individualLock, true);
  assert.deepEqual(sim.submitCommand('ZWS Zw1'), { ok: true, noop: true }, 'już zamknięta');
  assert.ok(sim.submitCommand('ZWO Zw1').ok);
  assert.equal(sim.ilk.points.get('Zw1').individualLock, false);
  const sec = sim.ilk.routes.get('A-D1').sections.find((x) => sim.ilk.sections.get(x).kind === 'station');
  assert.ok(sim.submitCommand(`ITS ${sec}`).ok);
  assert.equal(sim.ilk.sections.get(sec).closed, true);
  assert.equal(sim.submitCommand('POC A D1').ok, false, 'tor zamknięty');
  assert.ok(sim.submitCommand(`ITO ${sec}`).ok);
});

test('okno zdarzeń i alarmów: polecenia i dziennik jako zdarzenia; usterka jako alarm aktywny, potem nieaktywny; potwierdzanie', () => {
  const sim = ebi({ scenario: { id: 't', name: 't', endTime: '09:00', faults: [{ type: 'signal-fail', target: 'A', at: '07:01', duration: 2 }] } });
  const p = sim.input;
  sim.submitCommand('SES A');
  assert.ok(p.events.some((e) => e.kind === 'cmd' && e.text === 'SES A'));
  sim.submitCommand('XYZ');
  assert.ok(p.events.some((e) => e.kind === 'refused'));
  run(sim, 90); // 07:01 – usterka semafora A
  const al = p.alarmList();
  assert.ok(al.length >= 1, 'usterka semafora w alarmach');
  assert.equal(al[0].acked, false);
  assert.equal(al[0].active, true);
  assert.match(al[0].text, /USTERKA/);
  run(sim, 180); // po 2 min usterka mija – alarm nieaktywny, ale na liście do potwierdzenia
  assert.equal(p.alarmList()[0].active, false);
  sim.ackAlarms([al[0].id]);
  assert.equal(p.alarmList()[0].acked, true);
  sim.ackAlarms('all');
  assert.ok(p.alarmList().every((x) => x.acked));
});

test('kilka dróg między początkiem a końcem: elementy pośrednie do wyboru (błękitna ramka), POC z elementem pośrednim', async () => {
  const { default: gdynia } = await import('../src/stations/gdynia-glowna.js');
  const sim = new Simulation(gdynia, { srk: 'ebilock', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00' } });
  const p = sim.input;
  sim.press({ kind: 'signal', id: 'G7' });
  sim.pull({ kind: 'signal', id: 'G1' });
  const cand = p.armed.candidates.map((c) => c.id);
  assert.ok(cand.includes('Zw16'), `zwrotnice rozróżniające drogi: ${cand}`);
  assert.ok(!cand.includes('Zw26') && !cand.includes('Zw23'), 'zwrotnica wspólna obu drogom nie jest elementem pośrednim');
  // bez elementu pośredniego – droga zasadnicza
  assert.deepEqual(p.menu().map((m) => m.text), ['POC G7 G1', 'PZA G7 G1']);
  assert.deepEqual(p.submit('POC G7 G1').cmd, { type: 'route', id: 'G7-G1' });
  sim.press({ kind: 'signal', id: 'G7' }); sim.pull({ kind: 'signal', id: 'G1' });
  sim.pull({ kind: 'point', id: 'Zw16' });
  assert.deepEqual(p.armed.candidates, [], 'po wyborze elementu pośredniego ramki gasną');
  // element pośredni nazwą z obrazu – numer zwrotnicy (B1; dawniej identyfikator „Zw16”)
  assert.deepEqual(p.menu().map((m) => m.text), ['POC G7 G1 16', 'PZA G7 G1 16']);
  assert.deepEqual(p.submit('POC G7 G1 Zw16').cmd, { type: 'route', id: 'G7-G1#2' });
  // przez model (tu odmowa blokady samoczynnej – ważne, że chodzi o drogę alternatywną)
  assert.match(sim.submitCommand('POC G7 G1 Zw16').reason ?? 'ok', /G7-G1#2|ok/);
});

test('nazwy obiektów bez względu na wielkość liter (iPad pisze wielkimi): polecenie niesie identyfikatory ze stacji', () => {
  const sim = ebi();
  const p = sim.input;
  assert.deepEqual(p.submit('poc a d1').cmd, { type: 'route', id: 'A-D1' });
  assert.deepEqual(p.submit('POC D1 KE').cmd, { type: 'route', id: 'D1-E' });
  assert.deepEqual(p.submit('zws ZW1').cmd, { type: 'lock', id: 'Zw1' });
  const sec = sim.ilk.routes.get('A-D1').sections.find((x) => sim.ilk.sections.get(x).kind === 'station');
  assert.deepEqual(p.submit(`its ${sec.toLowerCase()}`).cmd, { type: 'close-section', section: sec, closed: true });
  assert.deepEqual(p.submit('SES TM1').cmd, { type: 'signal-stop', signal: 'Tm1', on: true });
  assert.deepEqual(p.submit('POZ KW').cmd, { type: 'block', exit: 'W', btn: 'Poz' });
  assert.ok(sim.submitCommand('POC A D1').ok);
});

// EBIScreen wyszarza polecenia niedostępne: na blokadzie samoczynnej (SBL) tylko ZK, bez poleceń Eap (Ir-1 §29; LIRK
// „EBILock 950 z pulpitem EBIScreen 300” §1 pkt 1). Dawniej menu SBL pokazywało WBL, POZ, KO, DPO, DKO, a WBL zmieniało kierunek.
test('blokada: na Eap WBL / OWBL / POZ / KO / DPO / DKO bez ZK; na SBL tylko ZK, polecenia Eap odrzucone', async () => {
  const sopot = (await import('../src/stations/sopot.js')).default;
  const s = new Simulation(sopot, { srk: 'ebilock', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', trains: [] } });
  s.pull({ kind: 'end', id: 'kOR1' });
  assert.deepEqual(s.input.menu().map((m) => m.code), ['ZK']);
  const r = s.submitCommand('DKO kOR1');
  assert.equal(r.ok, false);
  assert.match(r.reason, /DKO nie dotyczy/);
  const e = ebi();
  e.pull({ kind: 'end', id: 'kW' });
  assert.deepEqual(e.input.menu().map((m) => m.code), ['WBL', 'OWBL', 'POZ', 'KO', 'DPO', 'DKO']);
});

// Linia poleceń EBIScreen nazywa obiekty tak jak na obrazie (bsk.isdr.pl/srk_ebilock.php; LIRK EBIScreen 3 §1):
// „ZWP 1”, „ITS 1”, „MAN 1 C2” – dawniej tylko identyfikatory stacji (Zw1, T1, Tm1); identyfikatory działają dalej (B1).
test('B1: nazwy z obrazu – numer zwrotnicy, toru i tarczy; menu wpisuje nazwę z obrazu; PZA w dzienniku (I3)', async () => {
  const brzezina = (await import('../src/stations/brzezina.js')).default;
  const s = new Simulation(brzezina, { srk: 'ebilock', disruptions: 'none', scenario: { id: 't', name: 't', endTime: '09:00', trains: [] } });
  const p0 = s.ilk.points.values().next().value;
  const r = s.submitCommand(`ZWM ${p0.tile.label}`);
  assert.equal(r.ok, true, r.reason);
  run(s, 5);
  assert.equal(p0.position, '-');
  assert.ok(s.submitCommand('ITS 1').ok, 'tor 1 numerem z obrazu');
  assert.ok([...s.ilk.sections.values()].some((x) => String(x.track) === '1' && x.closed));
  s.pull({ kind: 'point', id: p0.id });
  assert.ok(s.input.menu().every((m) => m.text.endsWith(` ${p0.tile.label}`)), JSON.stringify(s.input.menu()));
  const sz = ebi();
  const logs = []; sz.bus.on('log', (l) => logs.push(l.msg));
  sz.ilk.setRoute('A-D1'); run(sz, 8);
  assert.ok(sz.submitCommand('PZA A D1').ok);
  assert.ok(logs.some((m) => /Doraźne zwolnienie przebiegu A-D1 \(PZA/.test(m)), logs.join('\n'));
});
