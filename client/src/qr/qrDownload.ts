import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

export function qrUrlFor(qrId: string): string {
  const base = import.meta.env.VITE_APP_BASE_URL?.replace(/\/$/, '') || window.location.origin
  // HashRouter is used (see main.tsx) so the app works on static hosts like GitHub
  // Pages that can't rewrite arbitrary paths to index.html — every route lives after
  // the "#", including the ones printed on physical QR codes.
  return `${base}/#/m/${qrId}`
}

export async function qrPngDataUrl(qrId: string): Promise<string> {
  return QRCode.toDataURL(qrUrlFor(qrId), { width: 1024, margin: 3, errorCorrectionLevel: 'H' })
}

export async function downloadQrPng(qrId: string): Promise<void> {
  const dataUrl = await qrPngDataUrl(qrId)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${qrId}.png`
  a.click()
}

const PAGE_MARGIN_MM = 15
const CELL_SIZE_MM = 55
const CELL_GAP_MM = 8
const QR_IMAGE_SIZE_MM = 40

export async function downloadQrSheetPdf(qrIds: string[], productName?: string): Promise<void> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const cols = Math.max(1, Math.floor((pageWidth - PAGE_MARGIN_MM * 2) / (CELL_SIZE_MM + CELL_GAP_MM)))
  const rows = Math.max(1, Math.floor((pageHeight - PAGE_MARGIN_MM * 2) / (CELL_SIZE_MM + CELL_GAP_MM)))
  const perPage = cols * rows

  for (let i = 0; i < qrIds.length; i++) {
    const qrId = qrIds[i]
    const posOnPage = i % perPage
    if (i > 0 && posOnPage === 0) pdf.addPage()

    const col = posOnPage % cols
    const row = Math.floor(posOnPage / cols)
    const cellX = PAGE_MARGIN_MM + col * (CELL_SIZE_MM + CELL_GAP_MM)
    const cellY = PAGE_MARGIN_MM + row * (CELL_SIZE_MM + CELL_GAP_MM)

    const dataUrl = await qrPngDataUrl(qrId)
    const imgX = cellX + (CELL_SIZE_MM - QR_IMAGE_SIZE_MM) / 2
    pdf.addImage(dataUrl, 'PNG', imgX, cellY, QR_IMAGE_SIZE_MM, QR_IMAGE_SIZE_MM)

    pdf.setFontSize(10)
    pdf.text(qrId, cellX + CELL_SIZE_MM / 2, cellY + QR_IMAGE_SIZE_MM + 5, { align: 'center' })

    if (productName) {
      pdf.setFontSize(8)
      pdf.setTextColor(120)
      pdf.text(productName, cellX + CELL_SIZE_MM / 2, cellY + QR_IMAGE_SIZE_MM + 9, { align: 'center' })
      pdf.setTextColor(0)
    }
  }

  pdf.save(qrIds.length === 1 ? `${qrIds[0]}.pdf` : `qr-sheet-${qrIds[0]}-to-${qrIds[qrIds.length - 1]}.pdf`)
}
