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

/**
 * Kaydı bir gruba taşır: grup, `alan` değeri aynı olan kayıtlardır (Hobiler'de
 * durum). Hedef kayıt verilirse onun önüne/arkasına iner — çağıran hedefin o
 * grupta olduğunu garanti eder. Verilmezse (grup başlığına bırakıldı) grubun
 * en üstüne iner; grup boşsa dizideki yeri değişmez, yalnız grubu değişir.
 *
 * Bir şey değişmiyorsa aynı dizi döner.
 */
export function grubaTasi<T extends { id: string }, K extends keyof T>(
  kayitlar: T[],
  kaynakId: string,
  alan: K,
  grup: T[K],
  hedef: { id: string; once: boolean } | null,
): T[] {
  const kaynak = kayitlar.find((k) => k.id === kaynakId);
  if (!kaynak) return kayitlar;

  let sonuc = kayitlar;
  if (hedef) {
    sonuc = tasi(kayitlar, kaynakId, hedef.id, hedef.once);
  } else {
    const ilk = kayitlar.find((k) => k[alan] === grup && k.id !== kaynakId);
    if (ilk) sonuc = tasi(kayitlar, kaynakId, ilk.id, true);
  }

  if (kaynak[alan] === grup) return sonuc;
  return sonuc.map((k) => (k.id === kaynakId ? { ...k, [alan]: grup } : k));
}
