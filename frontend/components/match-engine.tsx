'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  FileCheck2,
  FileUp,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  api,
  ApiDocument,
  ApiItem,
  DocumentType,
  documentNumber,
  formatDate,
  formatMoney,
  isMismatch,
  value,
} from '@/lib/api'
import { useAuth } from './providers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// Login screen
// ---------------------------------------------------------------------------

async function apiLogin(username: string, password: string) {
  const { login } = await import('@/lib/api')
  return login(username, password)
}

function Login() {
  const { setToken } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => apiLogin(username, password),
    onSuccess: (token) => setToken(token),
    onError: (e: Error) => setError(e.message),
  })

  return (
    <main className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileCheck2 />
            </div>
            <div>
              <CardTitle className="text-lg">Three-Way Match Engine</CardTitle>
              <p className="text-sm text-muted-foreground">
                Procurement reconciliation workspace
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertTriangle data-icon="inline-start" />
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Credentials are verified by your existing API.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

// ---------------------------------------------------------------------------
// App shell (left icon rail + content area)
// ---------------------------------------------------------------------------

const navItems = [
  { icon: LayoutDashboard, label: 'Workspace' },
  { icon: ClipboardList, label: 'Purchase orders' },
  { icon: PackageCheck, label: 'Fulfillment' },
  { icon: Boxes, label: 'SKU master' },
]

function Shell({
  children,
  onLogout,
  active,
  setActive,
}: {
  children: React.ReactNode
  onLogout: () => void
  active: string
  setActive: (x: string) => void
}) {
  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col items-center border-r bg-sidebar py-4 md:flex">
        <div className="mb-8 flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <FileCheck2 className="size-5" />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-3">
          {navItems.map(({ icon: Icon, label }) => (
            <Button
              key={label}
              variant={active === label ? 'secondary' : 'ghost'}
              size="icon"
              aria-label={label}
              onClick={() => setActive(label)}
            >
              <Icon />
            </Button>
          ))}
        </nav>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings2 />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={onLogout}>
          <LogOut />
        </Button>
      </aside>
      <div className="md:pl-16">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Document preview (authenticated blob fetch + iframe/img + zoom controls)
// ---------------------------------------------------------------------------

function DocumentPreview({ document, token }: { document?: ApiDocument; token: string }) {
  const [zoom, setZoom] = useState(100)

  const {
    data: blobUrl,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['file', document?.id],
    queryFn: async () => {
      const response = await fetch(document!.fileUrl as string, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Failed to load file')
      const blob = await response.blob()
      return URL.createObjectURL(blob)
    },
    enabled: Boolean(document?.fileUrl && token),
    staleTime: Infinity,
  })

  const type = String(document?.fileType || '').toLowerCase()

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b py-3">
        <CardTitle className="text-sm">Original file</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
          >
            <span aria-hidden="true">−</span>
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground">{zoom}%</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
          >
            <Plus />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-[330px] items-center justify-center overflow-auto bg-muted/20 p-4">
        {!document?.fileUrl ? (
          <div className="text-center text-sm text-muted-foreground">
            <FileUp className="mx-auto mb-2 size-8" />
            <p>Preview not available</p>
            <p className="mt-1 text-xs">The uploaded file cannot be previewed inline.</p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-[360px] w-full" />
        ) : isError || !blobUrl ? (
          <div className="text-center text-sm text-muted-foreground">
            <FileUp className="mx-auto mb-2 size-8" />
            <p>Preview not available</p>
            <p className="mt-1 text-xs">The uploaded file cannot be previewed inline.</p>
          </div>
        ) : type.includes('pdf') ? (
          <iframe
            title="Uploaded document preview"
            src={blobUrl}
            className="h-[360px] w-full origin-center border bg-background"
            style={{ transform: `scale(${zoom / 100})` }}
          />
        ) : (
          <img
            src={blobUrl}
            alt="Uploaded document"
            className="max-h-[360px] origin-center object-contain"
            style={{ transform: `scale(${zoom / 100})` }}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Line-item grid
// ---------------------------------------------------------------------------

function ItemTable({ items = [] }: { items?: ApiItem[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-sm">
          Line items <span className="font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU Name</TableHead>
              <TableHead>SKU ID</TableHead>
              <TableHead>Mapped SKU Name</TableHead>
              <TableHead>ERP Code</TableHead>
              <TableHead>EAN</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Unit MRP</TableHead>
              <TableHead>Gross Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length ? (
              items.map((item, index) => (
                <TableRow
                  key={String(item.skuId || index)}
                  className={!item.isMapped ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}
                >
                  <TableCell className="font-medium">
                    {!item.isMapped && (
                      <AlertTriangle className="mr-1 inline size-3 text-amber-600" />
                    )}
                    {String(item.skuName || '—')}
                  </TableCell>
                  <TableCell>{String(item.skuId || '—')}</TableCell>
                  <TableCell>{String(item.mappedSkuName || '—')}</TableCell>
                  <TableCell>{String(item.erpCode || '—')}</TableCell>
                  <TableCell>{String(item.ean || '—')}</TableCell>
                  <TableCell>{String(item.hsn || '—')}</TableCell>
                  <TableCell>{String(item.uom || '—')}</TableCell>
                  <TableCell>{String(item.quantity ?? '—')}</TableCell>
                  <TableCell
                    className={
                      isMismatch(item)
                        ? 'bg-red-100 font-semibold text-red-800 dark:bg-red-950/40 dark:text-red-200'
                        : ''
                    }
                  >
                    {formatMoney(item.unitPrice)}
                  </TableCell>
                  <TableCell
                    className={
                      isMismatch(item)
                        ? 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                        : ''
                    }
                  >
                    {formatMoney(item.unitMrp)}
                  </TableCell>
                  <TableCell>{formatMoney(item.grossAmount)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                  No line items returned for this document.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PO / Fulfillment / Delivery detail view
// ---------------------------------------------------------------------------

function Detail({
  document,
  match,
  token,
}: {
  document?: ApiDocument
  match?: Record<string, unknown>
  token: string
}) {
  const issue = Boolean(
    (match as any)?.status === 'mismatch' ||
      document?.status?.toString().toLowerCase().includes('mismatch') ||
      document?.items?.some(isMismatch)
  )

  return (
    <div className="flex flex-col gap-4">
      {issue && (
        <Alert
          variant="destructive"
          className="border-red-200 bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-100"
        >
          <AlertTriangle data-icon="inline-start" />
          <AlertTitle>Price Mismatch</AlertTitle>
          <AlertDescription>
            One or more values require review before this document can be reconciled.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">
              {document?.documentType || 'Purchase order'} details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
            {(
              [
                ['Document number', documentNumber(document || {})],
                ['PO number', value(document || {}, 'poNumber')],
                ['Vendor', document?.vendorName || value(document || {}, 'vendorName')],
                ['Document date', formatDate(document?.date)],
                ['Status', document?.status || 'Pending review'],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
                <span className="text-sm">{String(val)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <DocumentPreview document={document} token={token} />
      </div>

      <ItemTable items={document?.items} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary tab
// ---------------------------------------------------------------------------

function Summary({ summary, po }: { summary?: any; po: string }) {
  const rows = summary?.rows || []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            ['PO Amount', summary?.poAmount],
            ['Total Invoiced', summary?.totalInvoiced],
            ['Total Received', summary?.totalReceived],
          ] as const
        ).map(([label, amount]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatMoney(amount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">PO {po}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">Associated Invoice &amp; GRN</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Invoiced Qty</TableHead>
              <TableHead>Received Qty</TableHead>
              <TableHead>Pending Delivery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row: any, index: number) => (
                <TableRow
                  key={index}
                  className={row.documentType === 'current_status' ? 'font-semibold' : ''}
                >
                  <TableCell className="font-medium">
                    {row.documentType === 'current_status'
                      ? row.label
                      : String(row.documentNumber || '—')}
                  </TableCell>
                  <TableCell>
                    {row.documentType === 'current_status' ? (
                      <Badge variant={row.status === 'mismatch' ? 'destructive' : 'secondary'}>
                        {String(row.status || '—')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{String(row.documentType || '—')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>{String(row.cumulativeInvoicedQty ?? '—')}</TableCell>
                  <TableCell>{String(row.cumulativeReceivedQty ?? '—')}</TableCell>
                  <TableCell>{String(row.pendingDelivery ?? '—')}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No associated documents returned.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload dialog
// ---------------------------------------------------------------------------

function UploadDialog({ token, po }: { token: string; po: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<DocumentType>('PO')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Choose a file first')
      return api.upload(token, type, file)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', po] })
      qc.invalidateQueries({ queryKey: ['summary', po] })
      qc.invalidateQueries({ queryKey: ['match', po] })
      setOpen(false)
      setFile(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload data-icon="inline-start" />
          Upload document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload procurement document</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Document type</Label>
            <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PO">Purchase Order</SelectItem>
                <SelectItem value="GRN">GRN</SelectItem>
                <SelectItem value="Invoice">Invoice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="file">Original file</Label>
            <Input
              id="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Uploading and parsing…' : 'Upload document'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// SKU Master CRUD screen
// ---------------------------------------------------------------------------

const emptySkuForm = {
  skuErpCode: '',
  name: '',
  eanCode: '',
  hsnCode: '',
  uom: '',
  agreedRate: '',
  mrp: '',
}

function SkuMaster({ token }: { token: string }) {
  const qc = useQueryClient()
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['skus'],
    queryFn: () => api.skus(token),
  })

  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>(emptySkuForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () =>
      editing && editing !== 'new'
        ? api.updateSku(token, editing.id, form)
        : api.createSku(token, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skus'] })
      setEditing(null)
      setForm(emptySkuForm)
    },
  })

  const remove = useMutation({
    mutationFn: () => api.deleteSku(token, deleteId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skus'] })
      setDeleteId(null)
    },
  })

  const dialogOpen = Boolean(editing === 'new' || editing?.id)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Master data
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">SKU master</h1>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null)
              setForm(emptySkuForm)
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing('new')}>
              <Plus data-icon="inline-start" />
              Add SKU
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing === 'new' ? 'Create SKU' : 'Edit SKU'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.keys(emptySkuForm).map((key) => (
                <div className="flex flex-col gap-2" key={key}>
                  <Label htmlFor={key}>{key}</Label>
                  <Input
                    id={key}
                    value={form[key] ?? ''}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            {save.error && (
              <Alert variant="destructive">
                <AlertDescription>{(save.error as Error).message}</AlertDescription>
              </Alert>
            )}
            <Button
              disabled={save.isPending || !form.skuErpCode || !form.name}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save SKU'}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ERP Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>EAN</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead>Agreed Rate</TableHead>
              <TableHead>MRP</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : (
             data.map((sku: any, i: number) => (
                 <TableRow key={sku.id || i}>
                  <TableCell>{sku.skuErpCode || '—'}</TableCell>
                  <TableCell className="font-medium">{sku.name || '—'}</TableCell>
                  <TableCell>{sku.eanCode || '—'}</TableCell>
                  <TableCell>{sku.uom || '—'}</TableCell>
                  <TableCell>{formatMoney(sku.agreedRate)}</TableCell>
                  <TableCell>{formatMoney(sku.mrp)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(sku)
                        setForm({
                          skuErpCode: sku.skuErpCode || '',
                          name: sku.name || '',
                          eanCode: sku.eanCode || '',
                          hsnCode: sku.hsnCode || '',
                          uom: sku.uom || '',
                          agreedRate: sku.agreedRate ?? '',
                          mrp: sku.mrp ?? '',
                        })
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete SKU"
                      onClick={() => setDeleteId(sku.id)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SKU?</AlertDialogTitle>
            <AlertDialogDescription>
              This action permanently removes the selected master record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main app
// ---------------------------------------------------------------------------

export default function MatchEngine() {
  const { token, setToken } = useAuth()
  const [active, setActive] = useState('Workspace')
  const [po, setPo] = useState('')
  const [tab, setTab] = useState('po')
  const [selected, setSelected] = useState(0)

  const docsQuery = useQuery({
    queryKey: ['documents', po],
    queryFn: () => api.documents(token!, po),
    enabled: Boolean(token && po),
  })

  const matchQuery = useQuery({
    queryKey: ['match', po],
    queryFn: () => api.match(token!, po),
    enabled: Boolean(token && po),
  })

  const summaryQuery = useQuery({
    queryKey: ['summary', po],
    queryFn: () => api.summary(token!, po),
    enabled: Boolean(token && po && tab === 'summary'),
  })

  const docs = docsQuery.data || []
  const invoices = docs.filter((d) => d.documentType?.toLowerCase() === 'invoice')
  const grns = docs.filter((d) => d.documentType?.toLowerCase() === 'grn')
  const pos = docs.filter((d) => d.documentType?.toLowerCase() === 'po')
  const list = tab === 'invoice' ? invoices : tab === 'grn' ? grns : pos
  const current = list[selected] || list[0]

  if (!token) return <Login />

  return (
    <Shell onLogout={() => setToken(null)} active={active} setActive={setActive}>
      <header className="border-b bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Procurement control center
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Three-Way Match Engine</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-48 pl-9"
                placeholder="PO number"
                value={po}
                onChange={(e) => setPo(e.target.value)}
              />
            </div>
            {po && <UploadDialog token={token} po={po} />}
            <Badge variant="outline">Live API</Badge>
          </div>
        </div>
        <div className="border-t px-5">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v)
              setSelected(0)
            }}
          >
            <TabsList className="h-12 bg-transparent">
              <TabsTrigger value="po">
                Purchase Order <Badge variant="secondary" className="ml-1">{pos.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="invoice">
                Fulfillment <Badge variant="secondary" className="ml-1">{invoices.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="grn">
                Delivery <Badge variant="secondary" className="ml-1">{grns.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="summary">Summary</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-5">
        {active === 'SKU master' ? (
          <SkuMaster token={token} />
        ) : !po ? (
          <Card className="border-dashed">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <ClipboardList className="mb-4 size-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Select a purchase order</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Enter a PO number above to load documents, reconciliation issues, and the
                cumulative summary from your backend.
              </p>
            </CardContent>
          </Card>
        ) : tab === 'summary' ? (
          summaryQuery.isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            <Summary summary={summaryQuery.data} po={po} />
          )
        ) : (
          <div className="flex flex-col gap-4">
            {(tab === 'invoice' || tab === 'grn') && (
              <Tabs value={String(selected)} onValueChange={(v) => setSelected(Number(v))}>
                <TabsList className="h-auto flex-wrap justify-start bg-transparent p-0">
                  {list.map((d, i) => (
                    <TabsTrigger key={i} value={String(i)}>
                      {tab === 'invoice' ? 'Invoice' : 'GRN'}: {documentNumber(d)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            {docsQuery.isLoading ? (
              <Skeleton className="h-[600px] w-full" />
            ) : docsQuery.error ? (
              <Alert variant="destructive">
                <AlertDescription>{(docsQuery.error as Error).message}</AlertDescription>
              </Alert>
            ) : (
              <Detail document={current} match={matchQuery.data} token={token!} />
            )}
          </div>
        )}
      </main>
    </Shell>
  )
}