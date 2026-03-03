package com.pdfsmarttools.core.dispatcher

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler

/**
 * DispatcherProvider for unit tests.
 * Routes all dispatchers through a single TestCoroutineScheduler for deterministic execution.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TestDispatcherProvider(
    scheduler: TestCoroutineScheduler = TestCoroutineScheduler()
) : DispatcherProvider {
    private val testDispatcher = StandardTestDispatcher(scheduler)

    override val main: CoroutineDispatcher = testDispatcher
    override val io: CoroutineDispatcher = testDispatcher
    override val default: CoroutineDispatcher = testDispatcher
    override val unconfined: CoroutineDispatcher = testDispatcher
}
