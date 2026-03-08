import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { accent } from "@/lib/theme"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function DataTableColumnHeader({ column, label, className }) {
  if (!column.getCanSort()) {
    return <span className={className}>{label}</span>
  }

  const sorted = column.getIsSorted()

  return (
    <button
      className={cn(
        "inline-flex items-center gap-1 hover:text-zinc-200 transition-colors -ml-2 px-2 py-1 rounded-md hover:bg-white/5",
        className
      )}
      onClick={column.getToggleSortingHandler()}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className={cn("w-3 h-3", accent.textBright)} />
      ) : sorted === "desc" ? (
        <ArrowDown className={cn("w-3 h-3", accent.textBright)} />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  )
}

function DataTablePagination({ table }) {
  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const pageCount = table.getPageCount()
  const totalRows = table.getFilteredRowModel().rows.length
  const [jumpValue, setJumpValue] = React.useState('')

  const handleJump = (e) => {
    e.preventDefault()
    const page = parseInt(jumpValue, 10)
    if (page >= 1 && page <= pageCount) {
      table.setPageIndex(page - 1)
      setJumpValue('')
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-1 pt-4">
      {/* Left: count + page size selector */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-zinc-600 font-mono">
          {totalRows} issue{totalRows !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-600 font-mono">Show</span>
          <select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className={cn("bg-zinc-900 border border-white/10 rounded-md text-xs text-zinc-300 font-mono px-2 py-1 focus:outline-none", accent.focusBorder)}
            data-testid="page-size-select"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: nav + jump */}
      <div className="flex items-center gap-2">
        {/* Page jump */}
        <form onSubmit={handleJump} className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-600 font-mono">Go to</span>
          <input
            type="text"
            inputMode="numeric"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ''))}
            placeholder={String(pageIndex + 1)}
            className={cn("w-12 bg-zinc-900 border border-white/10 rounded-md text-xs text-zinc-300 font-mono px-2 py-1 text-center focus:outline-none", accent.focusBorder)}
            data-testid="page-jump-input"
          />
          <span className="text-xs text-zinc-600 font-mono">/ {pageCount}</span>
        </form>

        <div className="w-px h-4 bg-white/10 mx-1" />

        {/* Nav buttons */}
        <div className="flex items-center gap-1">
          <button
            className="p-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1 mx-1">
            {getPageRange(pageIndex, pageCount).map((page, i) =>
              page === '...' ? (
                <span key={`dots-${i}`} className="px-1 text-xs text-zinc-600 font-mono">...</span>
              ) : (
                <button
                  key={page}
                  onClick={() => table.setPageIndex(page)}
                    className={cn(
                      "min-w-[28px] h-7 rounded-md text-xs font-mono transition-colors",
                      page === pageIndex
                        ? `${accent.bgSubtle} border ${accent.borderBright} ${accent.text}`
                        : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5"
                    )}
                >
                  {page + 1}
                </button>
              )
            )}
          </div>

          <button
            className="p-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1.5 rounded-md border border-white/10 text-zinc-400 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Generate page number range with ellipsis for large page counts.
function getPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)

  const pages = []
  pages.push(0)

  let start = Math.max(1, current - 1)
  let end = Math.min(total - 2, current + 1)

  // Ensure at least 3 middle pages
  if (start <= 2) { start = 1; end = Math.max(end, 3) }
  if (end >= total - 3) { end = total - 2; start = Math.min(start, total - 4) }

  if (start > 1) pages.push('...')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 2) pages.push('...')

  pages.push(total - 1)
  return pages
}

function DataTable({
  columns,
  data,
  sorting,
  onSortingChange,
  globalFilter,
  onGlobalFilterChange,
  globalFilterFn,
  pageSize = 25,
  isLoading,
  emptyMessage = "No results.",
  className,
}) {
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange,
    onGlobalFilterChange,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableSortingRemoval: true,
    initialState: {
      pagination: { pageSize },
    },
  })

  return (
    <div className={cn("rounded-md", className)}>
      <div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-white/10 hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 h-9"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-zinc-500 font-mono">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-8 text-center text-sm text-zinc-500 font-mono">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-white/[0.05] hover:bg-white/[0.02]"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {!isLoading && table.getFilteredRowModel().rows.length > 0 && (
        <DataTablePagination table={table} />
      )}
    </div>
  )
}

export { DataTable, DataTableColumnHeader }
