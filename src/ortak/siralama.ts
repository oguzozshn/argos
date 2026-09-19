/**
 * Bir kaydı başka bir kaydın önüne ya da arkasına taşır. Sıra dosyadaki
 * dizinin sırasıdır; ayrı bir "sıra" alanı yok.
 *
 * Hedef kimlikle verilir, konumla değil: süzgeç açıkken ekranda görünen sıra
 * tam listenin bir alt kümesi, konumlar tutmaz. Taşıma bir şey değiştirmiyorsa
 * aynı dizi döner — çağıran boşuna yazmasın.
 */
export function tasi<T extends { id: string }>(
  kayitlar: T[],
  kaynakId: string,
  hedefId: string,
  once: boolean,
): T[] {
  if (kaynakId === hedefId) return kayitlar;
  const kaynak = kayitlar.find((k) => k.id === kaynakId);
  if (!kaynak || !kayitlar.some((k) => k.id === hedefId)) return kayitlar;

  const kalan = kayitlar.filter((k) => k.id !== kaynakId);
  const h = kalan.findIndex((k) => k.id === hedefId);
  const sonuc = [...kalan];
  sonuc.splice(once ? h : h + 1, 0, kaynak);
  return sonuc.every((k, i) => k === kayitlar[i]) ? kayitlar : sonuc;
}
