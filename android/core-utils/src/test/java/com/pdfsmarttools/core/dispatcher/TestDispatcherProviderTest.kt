package com.pdfsmarttools.core.dispatcher

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TestDispatcherProviderTest {

    @Test
    fun `all dispatchers are backed by test dispatcher`() {
        val provider = TestDispatcherProvider()
        // All dispatchers should be the same test dispatcher
        assertSame(provider.main, provider.io)
        assertSame(provider.io, provider.default)
        assertSame(provider.default, provider.unconfined)
    }

    @Test
    fun `can execute coroutines with test dispatcher`() = runTest {
        val provider = TestDispatcherProvider(testScheduler)
        var executed = false
        withContext(provider.io) {
            executed = true
        }
        assertTrue(executed)
    }

    @Test
    fun `DefaultDispatcherProvider has distinct dispatchers`() {
        val provider = DefaultDispatcherProvider()
        // main and io should be different dispatchers
        assertNotSame(provider.io, provider.default)
    }
}
