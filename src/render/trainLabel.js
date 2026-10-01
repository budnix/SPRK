/**
 * Położenie numeru pociągu na monitorze (bez DOM). Ie-104.1 §8 „Wyświetlacz numeru pociągu” pkt 2: na torze, który
 * może być początkiem lub końcem przebiegu, numer jest w osi toru, w całości – w skrajnym przypadku przykrywa symbol
 * odcinka torowego (nie sygnalizator za nim); pkt 5a: pociąg na lewej części toru – numer z lewej strony toru, na prawej
 * – z prawej. Numer stoi więc przy czole pociągu, ale nie wychodzi poza odcinek toru; tor krótszy niż numer – środek toru.
 *
 * @param {number} head środek kostki czoła pociągu (jednostki rysunku)
 * @param {[number, number]|null} span początek i koniec odcinka toru na planie (jednostki rysunku); null – bez ograniczeń
 * @param {number} half połowa szerokości numeru (jednostki rysunku)
 * @returns {number} środek numeru
 */
export function trainLabelX(head, span, half) {
  if (!span) return head;
  const [a, b] = span;
  if (b - a <= 2 * half) return (a + b) / 2;
  return Math.min(Math.max(head, a + half), b - half);
}
