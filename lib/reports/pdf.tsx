import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate, formatMoney, formatNumber } from "../format";
import type { ReportData } from "./build";
import { FX_LABEL } from "./rows";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#6b7280" },
  section: { marginTop: 14 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 3 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#9ca3af", paddingVertical: 3, fontFamily: "Helvetica-Bold" },
  total: { flexDirection: "row", paddingVertical: 4, fontFamily: "Helvetica-Bold" },
  right: { textAlign: "right" },
  box: { marginTop: 10, padding: 10, backgroundColor: "#f3f4f6", flexDirection: "row", justifyContent: "space-between" },
  big: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 7, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

const col = (w: number | string, extra: object = {}) => ({ width: w, ...extra });

function ReportPdf({ r }: { r: ReportData }) {
  return (
    <Document title={`Rendición ${formatDate(r.dateFrom)} – ${formatDate(r.dateTo)}`} author={r.reportName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Rendición de gastos</Text>
        <Text>{r.reportName}</Text>
        <Text style={styles.muted}>
          Período: {formatDate(r.dateFrom)} al {formatDate(r.dateTo)} · Fecha: {formatDate(r.generatedOn)}
          {r.status === "cerrado" ? " · Cerrada" : r.status === "borrador" ? " · Borrador" : " · Vista previa"}
        </Text>

        <View style={styles.box}>
          <Text style={styles.big}>Total a reembolsar</Text>
          <Text style={styles.big}>{formatMoney(r.totalEur.toFixed(2))}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Resumen por viaje</Text>
          <View style={styles.head}>
            <Text style={col("40%")}>Viaje</Text>
            <Text style={col("15%", styles.right)}>Gastos</Text>
            <Text style={col("15%", styles.right)}>Km</Text>
            <Text style={col("15%", styles.right)}>Peajes</Text>
            <Text style={col("15%", styles.right)}>Total</Text>
          </View>
          {r.trips.map((t) => (
            <View style={styles.row} key={t.id}>
              <Text style={col("40%")}>
                {t.name}
                {t.dateFrom && t.dateTo ? ` (${formatDate(t.dateFrom)} – ${formatDate(t.dateTo)})` : ""}
              </Text>
              <Text style={col("15%", styles.right)}>{formatMoney(t.totals.expensesEur.toFixed(2))}</Text>
              <Text style={col("15%", styles.right)}>{formatMoney(t.totals.mileageEur.toFixed(2))}</Text>
              <Text style={col("15%", styles.right)}>{formatMoney(t.totals.tollsEur.toFixed(2))}</Text>
              <Text style={col("15%", styles.right)}>{formatMoney(t.totals.totalEur.toFixed(2))}</Text>
            </View>
          ))}
          <View style={styles.total}>
            <Text style={col("85%")}>Total general</Text>
            <Text style={col("15%", styles.right)}>{formatMoney(r.totalEur.toFixed(2))}</Text>
          </View>
        </View>

        {r.trips.map((t) => (
          <View style={styles.section} key={`d-${t.id}`} wrap>
            <Text style={styles.h2}>
              {t.name}
              {t.destination ? ` — ${t.destination}` : ""}
            </Text>
            <View style={styles.head} fixed>
              <Text style={col("10%")}>Fecha</Text>
              <Text style={col("24%")}>Comercio</Text>
              <Text style={col("17%")}>Categoría</Text>
              <Text style={col("15%", styles.right)}>Monto orig.</Text>
              <Text style={col("10%", styles.right)}>Recargo</Text>
              <Text style={col("12%", styles.right)}>EUR</Text>
              <Text style={col("12%", styles.right)}>Fuente TC</Text>
            </View>
            {t.lines.map((l) => (
              <View style={styles.row} key={l.id} wrap={false}>
                <Text style={col("10%")}>{formatDate(l.date)}</Text>
                <Text style={col("24%")}>{l.merchant}</Text>
                <Text style={col("17%")}>{l.category}</Text>
                <Text style={col("15%", styles.right)}>{formatMoney(l.amount.toFixed(2), l.currency)}</Text>
                <Text style={col("10%", styles.right)}>{l.surcharge.gt(0) ? formatNumber(l.surcharge.toFixed(2)) : "—"}</Text>
                <Text style={col("12%", styles.right)}>{l.eur ? formatMoney(l.eur.toFixed(2)) : "Pendiente"}</Text>
                <Text style={col("12%", styles.right)}>{FX_LABEL[l.fxSource] ?? l.fxSource}</Text>
              </View>
            ))}
            {t.mileage.map((m) => (
              <View style={styles.row} key={m.id} wrap={false}>
                <Text style={col("10%")}>—</Text>
                <Text style={col("41%")}>
                  Kilómetros: ({formatNumber(m.kmTotal.toFixed(0), 0)} − {formatNumber(m.kmDeduction.toFixed(0), 0)}) km × {formatMoney(m.rateEur.toFixed(2))}
                  {m.reason ? ` · ${m.reason}` : ""}
                </Text>
                <Text style={col("25%", styles.right)}> </Text>
                <Text style={col("12%", styles.right)}>{formatMoney(m.eur.toFixed(2))}</Text>
                <Text style={col("12%", styles.right)}>—</Text>
              </View>
            ))}
            {t.tolls.map((p) => (
              <View style={styles.row} key={p.id} wrap={false}>
                <Text style={col("10%")}>{p.date ? formatDate(p.date) : "—"}</Text>
                <Text style={col("41%")}>Peaje{p.note ? ` · ${p.note}` : ""}</Text>
                <Text style={col("15%", styles.right)}>{formatMoney(p.amount.toFixed(2), p.currency)}</Text>
                <Text style={col("10%", styles.right)}>—</Text>
                <Text style={col("12%", styles.right)}>{p.eur ? formatMoney(p.eur.toFixed(2)) : "Pendiente"}</Text>
                <Text style={col("12%", styles.right)}>{p.currency === "EUR" ? "Sin conversión" : "Manual/BCE"}</Text>
              </View>
            ))}
            <View style={styles.total}>
              <Text style={col("76%")}>Total {t.name}</Text>
              <Text style={col("12%", styles.right)}>{formatMoney(t.totals.totalEur.toFixed(2))}</Text>
            </View>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>Montos en moneda original y en EUR. Recargo BBVA y fee de Wise según configuración.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function reportPdf(r: ReportData): Promise<Buffer> {
  return renderToBuffer(<ReportPdf r={r} />);
}
