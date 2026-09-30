/**
 * Ocena zmiany: zbiera zdarzenia punktowane (zdarzenie 'score' na szynie) i buduje raport.
 * Punkty ujemne za odstępstwa od procedur (dPz, dKo/dPo bez uzasadnienia, Sz bez usterki,
 * rozprucie, błędne telefonogramy, opóźnienia zawinione), dodatnie za punktualne wyprawienia.
 */
import { relationOf, categoryLabel } from './categories.js';
import { Traffic } from './Traffic.js';

export class Score {
  constructor(bus) {
    this.items = [];
    this.total = 0;
    bus.on('score', (e) => {
      this.items.push({ ...e });
      this.total += e.points;
      bus.emit('score-changed', this);
    });
  }

  grade() {
    if (this.total >= 40) return 'wzorowo';
    if (this.total >= 10) return 'dobrze';
    if (this.total >= -20) return 'dostatecznie';
    return 'niedostatecznie';
  }

  /**
   * Raport zmiany: ocena, punkty, wiersze pociągów (plan / rzeczywistość / opóźnienie / stan), statystyka
   * punktualności, zadania manewrowe i zdarzenia punktowane (także zsumowane wg kodu). `extra` dołącza liczniki itp.
   */
  report(traffic, extra = {}) {
    const tt = traffic.timetable();
    const rows = tt.map((e) => ({
      nr: e.nr, label: e.label ?? String(e.nr), cat: e.cat ?? null, catLabel: e.cat ? categoryLabel(e) : null, relation: relationOf(e), from: e.from ?? null, to: e.to ?? null,
      arr: e.arr ?? null, dep: e.dep ?? null, actualArr: e.actualArr ?? null, actualDep: e.actualDep ?? null,
      track: e.track ?? '', actualTrack: e.actualTrack ?? null, delay: e.delay || 0, delayIn: e.delayIn || 0,
      stop: !!e.stop, status: e.status, done: Traffic.isDone(e),
    }));
    const done = rows.filter((r) => r.done);
    const onTime = done.filter((r) => r.delay <= 2);
    const delayed = done.filter((r) => r.delay > 2);
    const delays = tt.filter((e) => e.delay > 2).map((e) => ({ nr: e.nr, delay: e.delay, delayIn: e.delayIn }));
    const byCode = new Map();
    for (const i of this.items) {
      const c = byCode.get(i.code) || { code: i.code, n: 0, points: 0, msg: i.msg };
      c.n++; c.points += i.points; byCode.set(i.code, c);
    }
    const tasks = (traffic.tasks || []).map((t) => ({ id: t.id, text: t.text, done: !!t.done, failed: !!t.failed, doneAt: t.doneAt ?? null, deadline: t.deadline ?? null }));
    return {
      total: this.total,
      grade: this.grade(),
      trains: tt.length,
      done: done.length,
      onTime: onTime.length,
      delayed: delayed.length,
      delayMinutes: delayed.reduce((a, r) => a + r.delay, 0),
      unfinished: rows.filter((r) => !r.done).map((r) => ({ nr: r.nr, label: r.label, status: r.status })),
      delays,
      rows,
      tasks,
      byCode: [...byCode.values()].sort((a, b) => a.points - b.points),
      items: [...this.items].sort((a, b) => a.time - b.time),
      ...extra,
    };
  }
}
