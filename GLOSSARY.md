# SPRK – ruch kolejowy na posterunku

Słownik pojęć symulatora pracy dyżurnego ruchu: słowa, których używa się w rozmowie o grze i w nazwach modułów.
Terminologia kolejowa wg Ie-1 / Ir-1; słownik mówi, co pojęcie znaczy, nie jak jest zaprogramowane.

## Język

### Przebieg i jego stany

**Przebieg**:
Droga jazdy od sygnalizatora do następnego sygnalizatora, toru albo szlaku, na której zwrotnice są ustawione i utwierdzone, a sygnalizator może podać sygnał zezwalający. Pociągowy albo manewrowy.
_Unikaj_: trasa, droga (bez „przebiegu”), ścieżka

**Przebieg nastawiany**:
Przebieg, którego nastawianie przyjęto, ale zwrotnice jeszcze się przestawiają – nie jest utwierdzony.
_Unikaj_: przebieg w toku, oczekujący

**Przebieg czeka na pociąg**:
Przebieg utwierdzony, do którego pociąg jeszcze nie wjechał, z sygnałem, który może zezwalać na jazdę.
_Unikaj_: przebieg aktywny, przebieg gotowy

**Sygnał na „Stój” przed pociągiem**:
Przebieg utwierdzony, do którego pociąg jeszcze nie wjechał, ale sygnalizator wskazuje „Stój”: zgasł z usterki, odwołał go dyżurny albo (nastawnia mechaniczna) dźwignia sygnałowa nie jest jeszcze przełożona.
_Unikaj_: przebieg zgaszony, przebieg anulowany

**Przebieg zwalniany czasowo**:
Przebieg, którego zwolnienie zażądano przed wjazdem pociągu i który rozwiąże się po odliczeniu czasu.
_Unikaj_: przebieg kasowany, przebieg wygasający

**Przebieg zajęty przez pociąg**:
Przebieg, którego sygnalizator pociąg już minął – pociąg jedzie nim albo przejechał, a przebieg nie jest jeszcze rozwiązany.
_Unikaj_: przebieg wykorzystany, przebieg w użyciu

**Przebieg nierozwiązany**:
Przebieg, przez który pociąg przejechał, a który sam się już nie rozwiąże, bo odcinek nie zwolnił się za pociągiem (usterka kontroli zajętości) – zostaje doraźne zwolnienie.
_Unikaj_: przebieg zawieszony, przebieg zablokowany

**Przebieg przed pociągiem**:
Każdy przebieg utwierdzony, do którego pociąg jeszcze nie wjechał: czeka na pociąg, ma sygnał na „Stój” przed pociągiem albo jest zwalniany czasowo.

**Zgaszenie sygnału z usterki**:
Samoczynne przejście sygnalizatora na „Stój” przed pociągiem z przyczyny po stronie urządzeń (zajętość bez taboru, zwrotnica bez kontroli), a nie z powodu taboru na drodze przebiegu. Uzasadnia sygnał zastępczy i rozkaz pisemny.

### Pociąg w rozkładzie

**Wpis rozkładu**:
Jeden pociąg w rozkładzie zmiany: jego definicja z rozkładu stacji albo scenariusza, plan (godziny w sekundach, chwila wyprawienia przez sąsiada) i to, co się z nim dzieje w trakcie zmiany.
_Unikaj_: wiersz, rekord, pozycja rozkładu

**Etap pociągu**:
Gdzie jest pociąg wpisu rozkładu i co się z nim dzieje: oczekiwany u sąsiada, żądanie pozwolenia, na szlaku, wjeżdża, jedzie, stoi przed sygnalizatorem, postój, na stacji, manewruje, odjeżdża, odjechał, na następnym posterunku, zakończył bieg, przekazany jako inny pociąg.
_Unikaj_: status (to tylko napis etapu), stan pociągu (stan jazdy składu to co innego)

**Pociąg obsłużony**:
Pociąg, za który stacja już odpowiedziała: wyprawiony na szlak (także jeszcze w drodze do sąsiada), zakończył bieg albo jego skład przejął inny pociąg.

**Pociąg skończony**:
Pociąg, z którym nic już się nie stanie: dojechał do następnego posterunku, zakończył bieg albo jego skład przejął inny pociąg. Pociąg obsłużony, ale jeszcze w drodze do sąsiada, nie jest skończony.
