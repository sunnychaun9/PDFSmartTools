import { NativeModules, Platform } from 'react-native';

const { PdfPreview } = NativeModules;

export type ThumbnailResult = {
  path: string;
  width: number;
  height: number;
  pageIndex: number;
  fromCache?: boolean;
};

export type ProgressiveThumbnailResult = {
  lowResPath: string;
  highResPath: string;
  pageIndex: number;
  fromCache: boolean;
};

export type FullPageResult = {
  path: string;
  width: number;
  height: number;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
};

export type OpenPdfResult = {
  pageCount: number;
  filePath: string;
};

export type PageInfo = {
  width: number;
  height: number;
  aspectRatio: number;
  rotation: number;
};

export type EngineStats = {
  isOpen: boolean;
  pageCount: number;
  activeRenders: number;
  bitmapPoolSize: number;
  thumbnailCacheSize: number;
  memoryUsedMB: number;
  diskCacheMB: number;
};

export type PreviewMetrics = {
  thumbnailRenderCount: number;
  avgThumbnailRenderMs: number;
  fullPageRenderCount: number;
  avgFullPageRenderMs: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatePercent: number;
  renderErrors: number;
  peakMemoryUsedMb: number;
  backgroundThumbnailsGenerated: number;
  backgroundQueueDurationMs: number;
};

export type CacheStats = {
  size: number;
  hitCount: number;
  missCount: number;
  diskCacheMB: number;
};

export type PrefetchResult = {
  prefetched: number;
  startPage: number;
  endPage: number;
};

function ensureAndroid(): void {
  if (Platform.OS !== 'android') {
    throw new Error('PDF Preview is only supported on Android');
  }
  if (!PdfPreview) {
    throw new Error('PdfPreview native module is not available');
  }
}

// ── Core Operations ─────────────────────────────────────────────────────

export async function openPdf(filePath: string): Promise<OpenPdfResult> {
  ensureAndroid();
  return await PdfPreview.openPdf(filePath);
}

export async function getPageCount(): Promise<number> {
  ensureAndroid();
  return await PdfPreview.getPageCount();
}

export async function getPageCountForFile(filePath: string): Promise<number> {
  ensureAndroid();
  return await PdfPreview.getPageCountForFile(filePath);
}

// ── Thumbnail Rendering ─────────────────────────────────────────────────

export async function renderThumbnail(pageIndex: number): Promise<ThumbnailResult> {
  ensureAndroid();
  return await PdfPreview.renderThumbnail(pageIndex);
}

/**
 * Progressive thumbnail: renders low-res quickly, then high-res.
 * Display low-res immediately, swap to high-res when ready.
 */
export async function renderThumbnailProgressive(
  pageIndex: number
): Promise<ProgressiveThumbnailResult> {
  ensureAndroid();
  return await PdfPreview.renderThumbnailProgressive(pageIndex);
}

// ── Full Page Rendering ─────────────────────────────────────────────────

export async function renderPage(
  pageIndex: number,
  scale: number = 1.5
): Promise<FullPageResult> {
  ensureAndroid();
  return await PdfPreview.renderPage(pageIndex, scale);
}

// ── Page Info ───────────────────────────────────────────────────────────

export async function getPageInfo(pageIndex: number): Promise<PageInfo> {
  ensureAndroid();
  return await PdfPreview.getPageInfo(pageIndex);
}

export async function getPageDimensions(
  pageIndex: number
): Promise<{ width: number; height: number }> {
  ensureAndroid();
  return await PdfPreview.getPageDimensions(pageIndex);
}

// ── Background Pre-Generation ────────────────────────────────────────────

/**
 * Start background thumbnail pre-generation.
 * Renders all page thumbnails in the background so scrolling is instant.
 * Call after openPdf(). Runs silently — does not block.
 */
export async function startThumbnailPreGeneration(): Promise<boolean> {
  ensureAndroid();
  return await PdfPreview.startThumbnailPreGeneration();
}

// ── Prefetch & Cancel ───────────────────────────────────────────────────

/**
 * Prefetch thumbnails for a range of pages (scroll-ahead).
 */
export async function prefetchThumbnails(
  startPage: number,
  endPage: number
): Promise<PrefetchResult> {
  ensureAndroid();
  return await PdfPreview.prefetchThumbnails(startPage, endPage);
}

/**
 * Cancel all pending render operations.
 * Call when leaving the preview screen.
 */
export async function cancelAllRendering(): Promise<boolean> {
  ensureAndroid();
  return await PdfPreview.cancelAllRendering();
}

// ── Lifecycle ───────────────────────────────────────────────────────────

export async function closePdf(): Promise<boolean> {
  ensureAndroid();
  return await PdfPreview.closePdf();
}

export async function clearThumbnailCache(): Promise<boolean> {
  ensureAndroid();
  return await PdfPreview.clearThumbnailCache();
}

// ── Diagnostics ─────────────────────────────────────────────────────────

export async function getEngineStats(): Promise<EngineStats> {
  ensureAndroid();
  return await PdfPreview.getEngineStats();
}

export async function getPreviewMetrics(): Promise<PreviewMetrics> {
  ensureAndroid();
  return await PdfPreview.getPreviewMetrics();
}

export async function getCacheStats(): Promise<CacheStats> {
  ensureAndroid();
  return await PdfPreview.getCacheStats();
}
