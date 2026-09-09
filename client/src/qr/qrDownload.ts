import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

export function qrUrlFor(qrId: string): string {
  const base = import.meta.env.VITE_APP_BASE_URL?.replace(/\/$/, '') || window.location.origin
  // HashRouter is used (see main.tsx) so the app works on static hosts like GitHub
  // Pages that can't rewrite arbitrary paths to index.html — every route lives after
  // the "#", including the ones printed on physical QR codes.
  return `${base}/#/m/${qrId}`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function qrPngDataUrl(qrId: string): Promise<string> {
  // errorCorrectionLevel 'H' tolerates up to ~30% of the code being obscured and
  // still scanning reliably — the centered "SCAN ME" plate below covers roughly
  // 11% of the image area, well inside that budget with real-world margin.
  const baseDataUrl = await QRCode.toDataURL(qrUrlFor(qrId), { width: 1024, margin: 3, errorCorrectionLevel: 'H' })

  const img = await loadImage(baseDataUrl)
  const size = img.width
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return baseDataUrl

  ctx.drawImage(img, 0, 0, size, size)

  const boxWidth = size * 0.56
  const boxHeight = size * 0.2
  const boxX = (size - boxWidth) / 2
  const boxY = (size - boxHeight) / 2
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#141414'
  ctx.font = `bold ${Math.round(size * 0.05)}px Arial, sans-serif`
  ctx.fillText('SCAN ME', size / 2, boxY + boxHeight * 0.38)

  ctx.fillStyle = '#5b5b5b'
  ctx.font = `italic ${Math.round(size * 0.032)}px Arial, sans-serif`
  ctx.fillText("Here's my message", size / 2, boxY + boxHeight * 0.72)

  return canvas.toDataURL('image/png')
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

    // The "SCAN ME" caption is baked into the QR image itself (see qrPngDataUrl) —
    // nothing about the internal QR ID is printed here, only an optional product
    // label below the code.
    const dataUrl = await qrPngDataUrl(qrId)
    const imgX = cellX + (CELL_SIZE_MM - QR_IMAGE_SIZE_MM) / 2
    pdf.addImage(dataUrl, 'PNG', imgX, cellY, QR_IMAGE_SIZE_MM, QR_IMAGE_SIZE_MM)

    if (productName) {
      pdf.setFontSize(8)
      pdf.setTextColor(120)
      pdf.text(productName, cellX + CELL_SIZE_MM / 2, cellY + QR_IMAGE_SIZE_MM + 5, { align: 'center' })
      pdf.setTextColor(0)
    }
  }

  pdf.save(qrIds.length === 1 ? `${qrIds[0]}.pdf` : `qr-sheet-${qrIds[0]}-to-${qrIds[qrIds.length - 1]}.pdf`)
}
