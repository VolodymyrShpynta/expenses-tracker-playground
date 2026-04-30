package com.vshpynta.expenses.api.util

import org.springframework.stereotype.Component
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Domain-agnostic helper for the small subset of ZIP archive operations
 * the app actually needs: pack a flat set of named entries on the way
 * out, and read every file entry on the way in keyed by its basename.
 *
 * Intentionally minimal — no streaming, no nested directories on write,
 * no compression-level knobs. Callers that need more should use
 * [ZipOutputStream] / [ZipInputStream] directly. This class exists so
 * higher-level codecs can stay focused on their format and not own the
 * fiddly zip-stream / path-traversal-safety code.
 */
@Component
class ZipArchive {

    /**
     * Encodes `entries` as a ZIP byte array. Entry names are taken
     * verbatim — the caller is responsible for using safe, flat
     * filenames (this method does not add directory components).
     */
    fun pack(entries: Map<String, ByteArray>): ByteArray =
        ByteArrayOutputStream().use { baos ->
            ZipOutputStream(baos).use { zip ->
                entries.forEach { (name, content) ->
                    zip.putNextEntry(ZipEntry(name))
                    zip.write(content)
                    zip.closeEntry()
                }
            }
            baos.toByteArray()
        }

    /**
     * Reads every file entry in the archive and keys the result by the
     * entry's basename (last path segment), so nested layouts produced
     * by Windows Explorer / macOS Finder ("re-zip" wraps everything in
     * a folder named after the original archive) still resolve to the
     * caller's expected filenames. Path components are skipped
     * entirely — we never need them, and ignoring them sidesteps the
     * "zip slip" path-traversal class of bugs.
     *
     * On collisions (two files with the same basename at different
     * depths) the shallowest entry wins — that's the file the user most
     * likely intends.
     */
    fun readByBasename(bytes: ByteArray): Map<String, ByteArray> {
        val picks = HashMap<String, Pick>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            zip.forEachFileEntry { entry ->
                val basename = entry.basename() ?: return@forEachFileEntry
                val depth = entry.depth()
                val previous = picks[basename]
                if (previous == null || depth < previous.depth) {
                    picks[basename] = Pick(depth, zip.readAllBytes())
                }
            }
        }
        return picks.mapValues { it.value.content }
    }

    /**
     * Plain class, not `data class` — `Pick` is a transient tagged
     * tuple used inside [readByBasename] only, and a synthesized
     * `equals` / `hashCode` over a `ByteArray` would compare by
     * reference (Kotlin's default), which is misleading. We never need
     * value semantics here.
     */
    private class Pick(val depth: Int, val content: ByteArray)

    /** Last path segment of the entry name, or `null` if the entry has no usable name. */
    private fun ZipEntry.basename(): String? =
        name.substringAfterLast('/')
            .substringAfterLast('\\')
            .takeIf { it.isNotEmpty() }

    /** Number of path separators in the entry name — 0 means the file is at the archive root. */
    private fun ZipEntry.depth(): Int =
        name.count { it == '/' || it == '\\' }

    /**
     * Iterates every non-directory entry, hiding the
     * `var entry = nextEntry; while (entry != null)` ceremony and the
     * paired `closeEntry()` call so callers focus on what to do with
     * each entry.
     */
    private inline fun ZipInputStream.forEachFileEntry(action: (ZipEntry) -> Unit) {
        var entry = this.nextEntry
        while (entry != null) {
            if (!entry.isDirectory) action(entry)
            closeEntry()
            entry = nextEntry
        }
    }
}
