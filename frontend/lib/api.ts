export type DocumentType = 'PO' | 'GRN' | 'Invoice'

export type ApiItem = {
  skuName?: string
  skuId?: string
  mappedSkuName?: string
  erpCode?: string
  ean?: string
  hsn?: string
  uom?: string
  quantity?: number
  unitPrice?: number
  unitMrp?: number
  grossAmount?: number
  isMismatch?: boolean
  isMapped?: boolean
  [key: string]: unknown
}

export type ApiDocument = {
  id?: string
  documentType?: DocumentType
  documentNumber?: string
  poNumber?: string
  vendorName?: string
  date?: string
  status?: string
  fileUrl?: string
  fileType?: string
  items?: ApiItem[]
  [key: string]: unknown
}

export type Summary = {
  poAmount?: number
  totalInvoiced?: number
  totalReceived?: number
  rows?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export type Sku = {
  id?: string
  skuErpCode?: string
  name?: string
  eanCode?: string
  hsnCode?: string
  uom?: string
  agreedRate?: number
  mrp?: number
  priceTolerance?: number
  [key: string]: unknown
}

const baseUrl = () => (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

async function apiFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`)
  return body as T
}

export async function login(username: string, password: string) {
  const response = await fetch(`${baseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Unable to sign in')
  return body?.token as string
}

function mismatchCheck(unitPrice: number | undefined, agreedRate: number | undefined, tolerance = 0.05) {
  if (!unitPrice || !agreedRate || agreedRate <= 0) return false
  return Math.abs(unitPrice - agreedRate) / agreedRate > tolerance
}

function mapRawDocument(
  raw: any,
  documentType: DocumentType,
  skuMap: Map<string, Sku>
): ApiDocument {
  const items: ApiItem[] = (raw.items || []).map((item: any) => {
    const skuId = item.skuMaster ? String(item.skuMaster) : undefined
    const sku = skuId ? skuMap.get(skuId) : undefined
    const quantity =
      documentType === 'GRN' ? item.receivedQuantity : item.quantity
    const unitPrice = documentType === 'Invoice' ? item.unitRate : undefined
    const unitMrp = item.mrp ?? sku?.mrp
    return {
      skuName: item.description,
      skuId,
      mappedSkuName: sku?.name,
      erpCode: item.itemCode,
      ean: sku?.eanCode,
      hsn: sku?.hsnCode,
      uom: sku?.uom,
      quantity,
      unitPrice,
      unitMrp,
      grossAmount: unitPrice && quantity ? unitPrice * quantity : undefined,
      isMapped: Boolean(sku),
      isMismatch: mismatchCheck(unitPrice, sku?.agreedRate, sku?.priceTolerance),
    }
  })

  return {
    id: raw._id,
    documentType,
    documentNumber: raw.poNumber ? raw.poNumber : raw.grnNumber || raw.invoiceNumber,
    poNumber: raw.poNumber,
    vendorName: raw.vendorName,
    date: raw.poDate || raw.grnDate || raw.invoiceDate,
    fileUrl: raw._id ? `${baseUrl()}/documents/${raw._id}/file` : undefined,
    fileType: raw.sourceFile?.mimeType,
    items,
  }
}

export const api = {
  documents: async (token: string, po: string): Promise<ApiDocument[]> => {
    const [docsResp, skus] = await Promise.all([
      apiFetch<{ po: any[]; grn: any[]; invoice: any[] }>(
        `/documents?poNumber=${encodeURIComponent(po)}`,
        token
      ),
      apiFetch<Sku[]>('/masters/sku', token),
    ])
    const skuMap = new Map(skus.map((s) => [String(s.id ?? (s as any)._id), s]))
    return [
      ...docsResp.po.map((d) => mapRawDocument(d, 'PO', skuMap)),
      ...docsResp.grn.map((d) => mapRawDocument(d, 'GRN', skuMap)),
      ...docsResp.invoice.map((d) => mapRawDocument(d, 'Invoice', skuMap)),
    ]
  },
  match: (token: string, po: string) =>
    apiFetch<Record<string, unknown>>(`/match/${encodeURIComponent(po)}`, token),
  summary: (token: string, po: string) =>
    apiFetch<Summary>(`/summary/${encodeURIComponent(po)}`, token),
  skus: (token: string) => apiFetch<Sku[]>('/masters/sku', token),
  createSku: (token: string, data: Partial<Sku>) =>
    apiFetch<Sku>('/masters/sku', token, { method: 'POST', body: JSON.stringify(data) }),
  updateSku: (token: string, id: string, data: Partial<Sku>) =>
    apiFetch<Sku>(`/masters/sku/${encodeURIComponent(id)}`, token, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteSku: (token: string, id: string) =>
    apiFetch<void>(`/masters/sku/${encodeURIComponent(id)}`, token, { method: 'DELETE' }),
  upload: (token: string, type: DocumentType, file: File) => {
    const data = new FormData()
    data.append('documentType', type.toLowerCase())
    data.append('file', file)
    return apiFetch<ApiDocument>('/documents/upload', token, { method: 'POST', body: data })
  },
}

export function value(doc: ApiDocument, key: string) {
  return String((doc as any)[key] ?? '—')
}
export function formatMoney(value?: unknown) {
  const number = Number(value)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(number)
    : '—'
}
export function formatDate(value?: unknown) {
  if (!value) return '—'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
export function documentNumber(doc: ApiDocument) {
  return doc.documentNumber || doc.id || 'Document'
}
export function isMismatch(item: ApiItem) {
  return Boolean(item.isMismatch)
}