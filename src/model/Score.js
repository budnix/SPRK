/**
 * Ocena zmiany: zbiera zdarzenia punktowane (zdarzenie 'score' na szynie) i buduje raport.
 * Punkty ujemne za odstępstwa od procedur (dPz, dKo/dPo bez uzasadnienia, Sz bez usterki,
 * rozprucie, błędne telefonogramy, opóźnienia zawinione), dodatnie za punktualne wyprawienia.
 */
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

  report(traffic) {
    const tt = traffic.timetable();
    const done = tt.filter((e) => e.status === 'na następnym posterunku' || e.status === 'zakończył bieg' || e.status.startsWith('przekazany'));
    const delays = tt.filter((e) => e.delay > 2).map((e) => ({ nr: e.nr, delay: e.delay, delayIn: e.delayIn }));
    return {
      total: this.total,
      grade: this.grade(),
      trains: tt.length,
      done: done.length,
      delays,
      items: [...this.items].sort((a, b) => a.time - b.time),
    };
  }
}
