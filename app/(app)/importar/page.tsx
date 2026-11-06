import { Card } from "@/components/ui/card";
import { t } from "@/lib/i18n/es";
import { Importer } from "./importer";

export default function ImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t.import.title}</h1>
      <Importer />
      <Card className="space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">¿Cómo bajo los archivos?</p>
        <p>{t.import.howWise}</p>
        <p>{t.import.howBbva}</p>
        <p>Los archivos no se guardan: se leen, se cargan los movimientos y se descartan.</p>
      </Card>
    </div>
  );
}
