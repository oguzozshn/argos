/**
 * Ana süreç ile arayüz arasındaki sözleşme. Tek yerde durur ki iki taraf
 * birbirinden habersiz değişmesin.
 */

/** Bir JSON dosyasının okunmuş hâli. `mtime` yazarken çakışma kontrolü için. */
export interface Okuma<T = unknown> {
  /** Dosya yoksa null. Bu bir hata değildir — henüz oluşmamış olabilir. */
  veri: T | null;
  /** Dosya yoksa null. Yazma isteğine aynen geri verilir. */
  mtime: number | null;
  yol: string;
}

export type Yazma =
  | { ok: true; mtime: number }
  /**
   * Dosya, biz okuduktan sonra dışarıdan değişmiş (sabah mutabakatı, asistan,
   * eski uygulama). Yazma yapılmadı; `guncel` diskteki son hâli taşır.
   */
  | { ok: false; sebep: "cakisma"; guncel: Okuma }
  | { ok: false; sebep: "hata"; mesaj: string };

/** Veri klasörünün durumu — uygulama açılışında arayüze bildirilir. */
export interface Ortam {
  dataDir: string;
  dataDirVar: boolean;
  /** Ayarın konması önerilen yer; klasör bulunamayınca arayüz bunu gösterir. */
  ayarYolu: string;
  /** Ayar için sırayla bakılan yollar ve o an var olup olmadıkları. */
  arananYollar: { yol: string; bulundu: boolean }[];
  surum: string;
  /** "win32" · "darwin" · "linux" — arayüz tarafında node tipleri yok, dizge. */
  platform: string;
  paketli: boolean;
}

/** İzleyiciden gelen olay. `yol` dataDir'e göreli, ileri eğik çizgiyle. */
export interface DegisimOlayi {
  yol: string;
  tur: "eklendi" | "degisti" | "silindi";
}

/* --- Todoist ----------------------------------------------------------- */

/**
 * Todoist'ten arayüze yalnızca bunlar geçer. Ham yanıt ana süreçte kalır:
 * anahtar da, kullanılmayan otuz alan da renderer'a inmez.
 */
export interface TodoistProje {
  id: string;
  ad: string;
  inbox: boolean;
}

export interface TodoistGorev {
  id: string;
  icerik: string;
  aciklama: string;
  projeId: string;
  /** "2026-09-08" ya da "2026-09-08T18:00:00". Tarihsizse null. */
  tarih: string | null;
  /** Todoist'in kendi yazdığı metin: "yarın 18:00", "her pazartesi". */
  tarihMetni: string | null;
  tekrarli: boolean;
  /** Todoist'te 4 = p1 (en yüksek), 1 = p4. */
  oncelik: number;
  etiketler: string[];
  altGorev: boolean;
}

export interface TodoistDurum {
  /** gizli.json'da anahtar var mı. Yoksa modül nedenini söyler. */
  anahtarVar: boolean;
  gizliYolu: string;
}

/**
 * Preload'un arayüze açtığı yüzey. Burada durur çünkü renderer tarafı
 * preload kaynağını (dolayısıyla `electron`'u) import etmesin.
 */
export interface ArgosApi {
  ortam(): Promise<Ortam>;
  veri: {
    oku<T = unknown>(yol: string): Promise<Okuma<T>>;
    yaz(yol: string, icerik: unknown, mtime: number | null): Promise<Yazma>;
    listele(klasor: string): Promise<string[]>;
    sil(yol: string): Promise<{ ok: boolean }>;
  };
  /** Veri klasöründeki dışarıdan gelen değişiklikleri dinler; abonelik iptali döner. */
  degisimDinle(geriCagri: (olay: DegisimOlayi) => void): () => void;
  /** Pencere düğmelerinin zemini yerel kaplamadır; temayla birlikte o da döner. */
  temaUygula(tema: "acik" | "koyu"): Promise<void>;

  todoist: {
    durum(): Promise<TodoistDurum>;
    projeler(): Promise<TodoistProje[]>;
    gorevler(projeId: string): Promise<TodoistGorev[]>;
    /** Bugün + gecikmiş, tüm projelerden (plan projesi hariç). */
    bugunVeGecikmis(): Promise<TodoistGorev[]>;
    /** Tarihi verilen aralıkta olan görevler — takvim için. */
    tarihAraligi(basIso: string, sonIso: string): Promise<TodoistGorev[]>;
    ekle(g: {
      icerik: string;
      projeId: string;
      tarihMetni?: string;
      oncelik?: number;
    }): Promise<TodoistGorev>;
    kapat(id: string): Promise<void>;
    ac(id: string): Promise<void>;
    /** Tarihi doğal dille değiştirir; null tarihi kaldırır. */
    tarihVer(id: string, tarihMetni: string | null): Promise<TodoistGorev>;
  };
}

export const KANAL = {
  veriOku: "veri:oku",
  veriYaz: "veri:yaz",
  veriListele: "veri:listele",
  veriSil: "veri:sil",
  ortam: "ortam",
  degisim: "veri:degisti",
  tema: "tema:uygula",
  tdDurum: "todoist:durum",
  tdProjeler: "todoist:projeler",
  tdGorevler: "todoist:gorevler",
  tdEkle: "todoist:ekle",
  tdKapat: "todoist:kapat",
  tdAc: "todoist:ac",
  tdTarih: "todoist:tarih",
  tdBugun: "todoist:bugun",
  tdAralik: "todoist:aralik",
} as const;

/**
 * Slotların ve alışkanlıkların projesi. Yapılacaklar modülü buraya DOKUNMAZ —
 * o proje Asistan modülünün işi (CLAUDE.md: kişisel görevler ayrı durur).
 */
export const PLAN_PROJESI = "6CrfrPC6f3G6wCMG";

/** Başlık çubuğu kaplamasının tema başına renkleri — token.css ile aynı değerler. */
export const BASLIK_RENKLERI = {
  acik: { color: "#F5F4F0", symbolColor: "#5A574F" },
  koyu: { color: "#191816", symbolColor: "#B3AEA4" },
} as const;
