import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'

export function Pagination({
  page,
  pageCount,
  onPageChange,
  previousLabel,
  nextLabel,
  getPageLabel,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  previousLabel: string
  nextLabel: string
  getPageLabel: (page: number) => string
}) {
  const windowSize = Math.min(3, pageCount)
  const windowStart = Math.min(
    Math.max(page - Math.floor(windowSize / 2), 1),
    Math.max(1, pageCount - windowSize + 1),
  )
  const visiblePages = Array.from(
    { length: windowSize },
    (_, index) => windowStart + index,
  )

  return (
    <nav className="flex items-center gap-1" aria-label={getPageLabel(page)}>
      <Button
        variant="outline"
        size="icon"
        className="size-8 rounded-lg"
        aria-label={previousLabel}
        disabled={page === 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      {visiblePages.map((visiblePage) => (
        <Button
          key={visiblePage}
          variant={visiblePage === page ? 'primary' : 'ghost'}
          size="icon"
          className="size-8 rounded-lg"
          onClick={() => onPageChange(visiblePage)}
          aria-label={getPageLabel(visiblePage)}
          aria-current={visiblePage === page ? 'page' : undefined}
        >
          {visiblePage}
        </Button>
      ))}
      <Button
        variant="outline"
        size="icon"
        className="size-8 rounded-lg"
        aria-label={nextLabel}
        disabled={page === pageCount}
        onClick={() => onPageChange(Math.min(pageCount, page + 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  )
}
