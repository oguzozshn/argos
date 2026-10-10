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
  /**
   * Seçilen klasör ayara yazıldı ama başka bir kaynak (ortam değişkeni, exe
   * yanındaki ayar) ağır bastı. Sessizce eski klasörde kalmak yerine söylenir.
   */
  ayarUyarisi?: string;
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
  /** Hex colour resolved from Todoist's colour name. */
  color: string;
  favorite: boolean;
  /** Todoist's own order in the sidebar. */
  order: number;
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
  /**
   * Todoist's own due string as stored ("every mon at 18:00"). Needed to move
   * a recurring task to a new date without losing its rule.
   */
  dueString?: string | null;
  tekrarli: boolean;
  /** Todoist'te 4 = p1 (en yüksek), 1 = p4. */
  oncelik: number;
  etiketler: string[];
  altGorev: boolean;
  /**
   * "local" marks an Argos-local task shown in a Todoist-shaped screen
   * (Takvim, Hafta, Bugün cards). Absent means a Todoist task.
   */
  source?: "local";
  /**
   * A later repeat of a recurring task, drawn by the calendar from its rule.
   * Not a real date: completing or moving happens on the task's next date.
   */
  projected?: boolean;
}

/** Editable fields of a Todoist task apart from its date, which goes through `tarihVer`. */
export interface TodoistTaskPatch {
  title?: string;
  description?: string;
  /** 1 = P1 (highest) … 4 = P4. */
  priority?: 1 | 2 | 3 | 4;
}

export interface TodoistProjectPatch {
  name?: string;
  /** Todoist's colour name ("berry_red", "sky_blue" …), not hex. */
  color?: string;
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
  /**
   * Veri klasörünü kullanıcıya seçtirir ve seçimi kalıcı ayara yazar.
   * İptal edilirse null döner. Ayar dosyasını elle yerleştirmek zorunda
   * kalmamak için var: klasör bulunamadığında tek yapılabilir şey buydu.
   */
  klasorSec(): Promise<Ortam | null>;
  /**
   * Todoist anahtar dosyasını kullanıcıya seçtirir ve yolu kalıcı ayara
   * yazar. İptal edilirse null döner. Anahtarın kendisi arayüze inmez —
   * dönen yalnızca durum.
   */
  gizliSec(): Promise<TodoistDurum | null>;
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
    /** `@önemli` etiketli açık görevler, tüm projelerden (plan projesi hariç). */
    onemliler(): Promise<TodoistGorev[]>;
    /** Önemli etiketini ekler/kaldırır; görevin diğer etiketlerine ve tarihine dokunmaz. */
    onemliYap(id: string, onemli: boolean): Promise<TodoistGorev>;
    /** Every open task in every project except the plan project. */
    allTasks(): Promise<TodoistGorev[]>;
    /** Edits title, description or priority (1 = P1 … 4 = P4). Never touches the date. */
    updateTask(id: string, patch: TodoistTaskPatch): Promise<TodoistGorev>;
    /** Permanently deletes a task; the Todoist copy records it so the sync does not keep it. */
    deleteTask(id: string): Promise<void>;
    /** Permanently deletes a project with its tasks, the same way. */
    deleteProject(id: string): Promise<void>;
    /** Syncs Argos's Todoist copy now; what Todoist deleted becomes Argos lists and tasks. */
    sync(): Promise<void>;
    /** Moves a task to another project. */
    moveTask(id: string, projectId: string): Promise<void>;
    setProjectFavorite(id: string, favorite: boolean): Promise<TodoistProje>;
    /** Every open recurring task, whatever its next date; the calendar draws their later repeats. */
    recurringTasks(): Promise<TodoistGorev[]>;
    /** Renames or recolours a project; the change reaches the phone too. */
    updateProject(id: string, patch: TodoistProjectPatch): Promise<TodoistProje>;
    ekle(g: {
      icerik: string;
      projeId: string;
      tarihMetni?: string;
      oncelik?: number;
      description?: string;
      labels?: string[];
    }): Promise<TodoistGorev>;
    kapat(id: string): Promise<void>;
    ac(id: string): Promise<void>;
    /** Tarihi doğal dille değiştirir; null tarihi kaldırır. */
    tarihVer(id: string, tarihMetni: string | null): Promise<TodoistGorev>;
    /**
     * Todoist'in doğal dil hızlı eklemesi: "yarın 18:00 fatura #Ev @iş p1".
     * Proje, etiket, öncelik ve tarih metinden çözülür; proje yoksa gelen kutusu.
     */
    hizliEkle(metin: string): Promise<TodoistGorev>;
  };
  /** Başka bir pencereden görev eklendi; listeler tazelensin. Abonelik iptali döner. */
  todoistDegisimDinle(geriCagri: () => void): () => void;
  /** Telegram'dan gelen eklemeler yerel dosyalara işlendi; adlar `botAl` ile alınır. Abonelik iptali döner. */
  botAktarildiDinle(geriCagri: () => void): () => void;
  /** Henüz gösterilmemiş Telegram eklemelerini verir ve listeyi boşaltır. */
  botAl(): Promise<string[]>;
  /** Günlük yedeklerin klasörünü Gezgin'de açar. */
  yedekAc(): Promise<void>;
  /** Windows bildirimi gösterir (odak sayacı bitince). */
  bildirimGoster(baslik: string, govde: string): Promise<void>;
  /** Tepsi ipucundaki kalan süre; null ipucunu sadeye döndürür. */
  odakTepsi(metin: string | null): Promise<void>;
  /** Yalnızca hızlı yakalama penceresinde anlamlı. */
  yakala: {
    gizle(): Promise<void>;
    /** Pencere kısayolla her açıldığında çağrılır. Abonelik iptali döner. */
    acildiDinle(geriCagri: () => void): () => void;
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
  tdOnemliler: "todoist:onemliler",
  tdOnemliYap: "todoist:onemli-yap",
  tdAllTasks: "todoist:all-tasks",
  tdUpdateTask: "todoist:update-task",
  tdDeleteTask: "todoist:delete-task",
  tdMoveTask: "todoist:move-task",
  tdProjectFavorite: "todoist:project-favorite",
  tdUpdateProject: "todoist:update-project",
  tdRecurring: "todoist:recurring",
  tdDeleteProject: "todoist:delete-project",
  tdSync: "todoist:sync",
  tdHizli: "todoist:hizli",
  tdDegisti: "todoist:degisti",
  yakalaGizle: "yakala:gizle",
  yakalaAcildi: "yakala:acildi",
  ayarKlasor: "ayar:klasor-sec",
  ayarGizli: "ayar:gizli-sec",
  botAktarildi: "bot:aktarildi",
  botAl: "bot:al",
  yedekAc: "yedek:ac",
  bildirim: "bildirim:goster",
  odakTepsi: "odak:tepsi",
} as const;

/**
 * Slotların ve alışkanlıkların projesi. Yapılacaklar modülü buraya DOKUNMAZ —
 * o proje Asistan modülünün işi (CLAUDE.md: kişisel görevler ayrı durur).
 */
export const PLAN_PROJESI = "6CrfrPC6f3G6wCMG";

/**
 * Bugün ekranının en üstünde geri sayımla duran görevlerin Todoist etiketi
 * (sınav, başvuru). Etiket olduğu için telefondan ve hızlı yakalamadan
 * `@önemli` yazarak da verilir.
 */
export const ONEMLI_ETIKETI = "önemli";

/** Todoist etiketleri büyük/küçük harf ayırmıyor; "Önemli" de sayılsın. */
export const onemliMi = (g: { etiketler: string[] }): boolean =>
  g.etiketler.some((e) => e.toLocaleLowerCase("tr") === ONEMLI_ETIKETI);

/** Başlık çubuğu kaplamasının tema başına renkleri — token.css ile aynı değerler. */
export const BASLIK_RENKLERI = {
  acik: { color: "#F5F4F0", symbolColor: "#5A574F" },
  koyu: { color: "#191816", symbolColor: "#B3AEA4" },
} as const;
