/**
 * Aynı dosyaya giden yazmaları sıraya koyar ve biriktirir.
 *
 * Neden: her yazma, okuma anındaki mtime'ı taşıyor (çakışma kontrolü). Hızlı
 * yazımda ikinci yazma birincinin cevabını beklemeden, yani eski mtime ile
 * yola çıkıyordu — ve kendi yazmamıza çarpıp "dışarıdan değişti" diye
 * düşüyordu. Burada bir seferde tek yazma uçuşta olur.
 *
 * Uçuş sürerken gelen değerlerden yalnızca sonuncusu yazılır: her değer
 * dosyanın tam hâli, arada kalanlar zaten onun içinde. Biriken çağıranlar
 * kendi değerlerini kapsayan yazmanın sonucunu alır.
 *
 * `devam` false dönerse (çakışma, hata) bekleyen değer atılır: o değer artık
 * geçersiz bir hâlin üstüne kurulmuş. Bekleyenler aynı sonucu alır.
 */
export interface Sirali<T, R> {
  (deger: T): Promise<R>;
  /** Uçuşta ya da bekleyen yazma var mı. */
  mesgul: () => boolean;
  /** Başlatılmış yazma sayısı. Bir okuma sürerken yazma olup olmadığını söyler. */
  nesil: () => number;
}

export function sirali<T, R>(
  is: (deger: T) => Promise<R>,
  devam: (r: R) => boolean,
  /** Kuyruk tamamen boşalınca çağrılır. */
  bosalinca?: () => void,
): Sirali<T, R> {
  type Bekleyen = {
    deger: T;
    cagiranlar: Array<{ coz: (r: R) => void; reddet: (e: unknown) => void }>;
  };
  let bekleyen: Bekleyen | null = null;
  let calisiyor = false;
  let nesil = 0;

  const bosalt = async (): Promise<void> => {
    calisiyor = true;
    while (bekleyen) {
      const { deger, cagiranlar } = bekleyen;
      bekleyen = null;
      try {
        nesil++;
        const r = await is(deger);
        if (!devam(r) && bekleyen) {
          cagiranlar.push(...(bekleyen as Bekleyen).cagiranlar);
          bekleyen = null;
        }
        for (const c of cagiranlar) c.coz(r);
      } catch (e) {
        if (bekleyen) cagiranlar.push(...(bekleyen as Bekleyen).cagiranlar);
        bekleyen = null;
        for (const c of cagiranlar) c.reddet(e);
      }
    }
    calisiyor = false;
    bosalinca?.();
  };

  const f = ((deger: T) =>
    new Promise<R>((coz, reddet) => {
      if (bekleyen) {
        bekleyen.deger = deger;
        bekleyen.cagiranlar.push({ coz, reddet });
      } else {
        bekleyen = { deger, cagiranlar: [{ coz, reddet }] };
      }
      if (!calisiyor) void bosalt();
    })) as Sirali<T, R>;
  f.mesgul = () => calisiyor || bekleyen !== null;
  f.nesil = () => nesil;
  return f;
}

/**
 * İzleyiciden gelen değişim olayının dışarıdan mı geldiğine karar verir.
 *
 * İki yarış kapatılıyor:
 * - Okuma sürerken kullanıcı yazarsa okuma yazmadan ÖNCEKİ hâli getirebilir.
 *   Onu uygulamak ekranı geri sarar ve bilinen mtime'ı eskiye çeker; sonraki
 *   yazma kendi yazmamıza çarpardı. Okuma boyunca yazma olduysa sonuç atılır.
 * - Yazma sürerken gelen olay (OneDrive, app.py) yutulmasın: işaretlenir,
 *   kuyruk boşalınca bir kez bakılır.
 */
export function disDegisimBekcisi<O extends { mtime: number | null }>(b: {
  kuyruk: Pick<Sirali<unknown, unknown>, "mesgul" | "nesil">;
  oku: () => Promise<O>;
  /** Bizim bildiğimiz son mtime. */
  bilinen: () => number | null;
  /** Gerçekten dışarıdan gelen hâl. */
  uygula: (o: O) => void;
}): { olay: () => Promise<void>; kuyrukBosaldi: () => Promise<void> } {
  let kacan = false;

  const bak = async (): Promise<void> => {
    if (b.kuyruk.mesgul()) {
      kacan = true;
      return;
    }
    const oncekiNesil = b.kuyruk.nesil();
    const o = await b.oku();
    if (b.kuyruk.mesgul() || b.kuyruk.nesil() !== oncekiNesil) {
      // Okuma sürerken yazdık: elimizdeki okuma bayat olabilir. Yazmanın
      // çakışma kontrolü o ana kadarki dış değişikliği zaten yakaladı;
      // sonrasına kuyruk boşalınca bakılır.
      kacan = true;
      return;
    }
    // Diskteki damga bizim son yazdığımızsa olay kendi yazmamızdır.
    if (o.mtime === b.bilinen()) return;
    b.uygula(o);
  };

  return {
    olay: bak,
    kuyrukBosaldi: async () => {
      if (!kacan) return;
      kacan = false;
      await bak();
    },
  };
}
