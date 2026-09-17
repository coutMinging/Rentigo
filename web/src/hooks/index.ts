import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'
import type { PageResult } from '../types'

interface UseTableQueryOptions<T> {
  fetcher: (params: Record<string, unknown>) => Promise<PageResult<T>>
  defaultFilters?: Record<string, unknown>
  pageSize?: number
}

/**
 * 列表页通用数据钩子：分页、筛选、加载态与刷新。
 * 页面只需提供 fetcher，其余样板代码全部复用。
 */
export function useTableQuery<T>({
  fetcher,
  defaultFilters = {},
  pageSize: initialPageSize = 10,
}: UseTableQueryOptions<T>) {
  const [list, setList] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [filters, setFilters] = useState<Record<string, unknown>>(defaultFilters)
  /** 完整响应体，供需要额外汇总字段（如账单 totals）的页面使用 */
  const [meta, setMeta] = useState<PageResult<T> | null>(null)

  // 用 ref 持有 fetcher，避免调用方每次渲染新建函数导致无限请求
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const load = useCallback(async (p: number, ps: number, f: Record<string, unknown>) => {
    setLoading(true)
    try {
      const result = await fetcherRef.current({ ...f, page: p, pageSize: ps })
      setList(result.list ?? [])
      setTotal(result.total ?? 0)
      setMeta(result)
    } catch (err) {
      console.error('[table] 列表加载失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(page, pageSize, filters)
  }, [load, page, pageSize, filters])

  /** 提交筛选条件，自动回到第一页 */
  const search = useCallback((next: Record<string, unknown>) => {
    setFilters(next)
    setPage(1)
  }, [])

  /** 保持当前条件重新拉取 */
  const refresh = useCallback(() => {
    load(page, pageSize, filters)
  }, [load, page, pageSize, filters])

  const changePage = useCallback((nextPage: number, nextSize: number) => {
    setPage(nextPage)
    setPageSize(nextSize)
  }, [])

  return {
    list,
    setList,
    total,
    meta,
    loading,
    page,
    pageSize,
    filters,
    search,
    refresh,
    changePage,
  }
}

/** 一次性加载下拉选项 */
export function useOptions<T>(
  loader: () => Promise<T[]>,
  deps: unknown[] = [],
): { options: T[]; loading: boolean; reload: () => void } {
  const [options, setOptions] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(() => {
    setLoading(true)
    loaderRef.current()
      .then((data) => setOptions(data ?? []))
      .catch((err) => console.error('[options] 加载失败:', err))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { options, loading, reload: run }
}

/** 权限判断，用法：const can = usePermission(); can('bill', 'edit') */
export function usePermission() {
  return useAuthStore((state) => state.can)
}
