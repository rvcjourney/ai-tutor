package com.aitutor.admin;

/** Port of backend/src/admin/slugify.js — normalizes free text (a Topic/Sub-Topic
 *  name) into an identifier segment. "Interest & Repayment" becomes
 *  "interest_and_repayment" (lower) or "INTEREST_AND_REPAYMENT" (upper).
 *  Note: "&" and the word "and" both normalize to the same thing — two distinct
 *  spellings of a sub-topic name can collide on the generated state-id prefix;
 *  that's a content authoring hazard (see csvImporter's duplicate-id check), not
 *  a bug in this function. */
public final class Slugify {
    private Slugify() {
    }

    private static String core(String text) {
        String s = text.trim().replace("&", " and ");
        // \p{L} (any Unicode letter) + \p{N} (any Unicode digit) — not the ASCII-only
        // a-zA-Z0-9. A sub-topic/topic name written entirely in a non-Latin script
        // (Hindi/Devanagari, etc.) has every character fall outside [a-zA-Z0-9], so
        // the ASCII-only version stripped the whole name down to an empty string —
        // every such name then collapsed to the identical (empty) prefix, colliding
        // on generated state ids like "TOPIC__Q1" the moment more than one appeared
        // in the same topic. \p{L}/\p{N} preserve the actual distinguishing
        // characters for any script, while still collapsing punctuation/spaces into
        // underscores exactly as before — a strict superset of the old ASCII
        // behavior, so existing English-only content generates identical ids.
        s = s.replaceAll("[^\\p{L}\\p{N}]+", "_");
        s = s.replaceAll("^_+|_+$", "");
        s = s.replaceAll("_+", "_");
        return s;
    }

    public static String lower(String text) {
        return core(text).toLowerCase();
    }

    public static String upper(String text) {
        return core(text).toUpperCase();
    }
}
