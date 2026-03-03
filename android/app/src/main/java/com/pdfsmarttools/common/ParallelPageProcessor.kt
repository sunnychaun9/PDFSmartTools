@file:Suppress("unused")
package com.pdfsmarttools.common

/**
 * Delegates to core-utils module. This file exists for backward compatibility
 * during the incremental migration. Engines in :app still import from common.
 * Once all engines are moved to feature modules, this file can be deleted.
 */
typealias ParallelPageProcessor = com.pdfsmarttools.core.parallel.ParallelPageProcessor
typealias ParallelConfig = com.pdfsmarttools.core.parallel.ParallelConfig
