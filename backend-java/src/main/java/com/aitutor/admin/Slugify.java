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
        s = s.replaceAll("[^a-zA-Z0-9]+", "_");
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
