package com.vshpynta.expenses.api.util

import java.util.concurrent.ConcurrentHashMap

/**
 * General-purpose thread-safe in-memory cache
 *
 * Uses ConcurrentHashMap.newKeySet() which is thread-safe without additional locking
 *
 * @param T The type of elements to cache
 */
class ConcurrentCache<T> {

    private val cache = ConcurrentHashMap.newKeySet<T>()

    /**
     * Checks if element is in cache
     */
    fun contains(element: T): Boolean {
        return element in cache
    }

    /**
     * Adds element to cache
     */
    fun add(element: T): Boolean {
        return cache.add(element)
    }

    /**
     * Adds all elements to cache
     */
    fun addAll(elements: Collection<T>) {
        cache.addAll(elements)
    }

    /**
     * Removes element from cache
     */
    fun remove(element: T): Boolean {
        return cache.remove(element)
    }

    /**
     * Clears all elements from cache
     */
    fun clear() {
        cache.clear()
    }

    /**
     * Returns current size of cache
     */
    fun size(): Int {
        return cache.size
    }

    /**
     * Returns all elements as a set
     */
    fun toSet(): Set<T> {
        return cache.toSet()
    }
}
