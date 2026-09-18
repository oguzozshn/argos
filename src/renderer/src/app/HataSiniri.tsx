import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { BosDurum, Dugme, Kart } from "@/ui/bilesenler";

/**
 * Bir ekran çökerse yalnızca o ekran düşer. Sınır yokken tek bir bozuk kayıt
 * bütün pencereyi beyaza çeviriyordu; kenar çubuğu da gidince başka ekrana
 * geçip kurtulmak bile mümkün değildi.
 *
 * Kabuk bunu rota başına anahtarla kuruyor: başka ekrana geçmek sınırı
 * sıfırlar.
 */
export class HataSiniri extends Component<{ children: ReactNode }, { hata: Error | null }> {
  state = { hata: null as Error | null };

  static getDerivedStateFromError(hata: Error) {
    return { hata };
  }

  componentDidCatch(hata: Error, bilgi: ErrorInfo) {
    console.error("[ekran çöktü]", hata, bilgi.componentStack);
  }

  render() {
    const { hata } = this.state;
    if (!hata) return this.props.children;
    return (
      <Kart>
        <BosDurum
          ikon={<AlertTriangle size={30} strokeWidth={1.5} />}
          baslik="Bu ekran açılamadı"
          metin={`${hata.message} — veri dosyaları değişmedi. Başka bir ekrana geçebilir ya da yeniden deneyebilirsin.`}
          eylem={
            <Dugme tur="cizgili" onClick={() => this.setState({ hata: null })}>
              Yeniden dene
            </Dugme>
          }
        />
      </Kart>
    );
  }
}
