// src/api.js
import axios from "axios";

// Very broad subjects to skip (too generic)
const GENERIC_SUBJECTS = new Set([
  "fiction",
  "novels",
  "american literature",
  "children's literature",
  "biography",
  "autobiography",
  "literature",
  "history",
  "poetry",
  "drama",
  "memoirs",
  "children's stories",
]);

/**
 * Fetch a work’s basic info by its Open Library work‐key (e.g. "/works/OL12345W"):
 * Returns { id, title, subjects[], languages[] } or null on error.
 */
export async function fetchWorkByID(workKey) {
  try {
    const { data } = await axios.get(`https://openlibrary.org${workKey}.json`);
    return {
      id: workKey,
      title: data.title || "",
      subjects: (data.subjects || []).slice(0, 10).map((s) => s.toLowerCase()),
      languages: (data.languages || []).map((l) => l.key.split("/").pop()),
    };
  } catch {
    return null;
  }
}

/**
 * Given an array of queryBooks (each { id, title, subjects[], languages[] }),
 * return up to 10 English recs. Each rec is tagged with matchingBookIds = Set of root IDs it matched.
 *
 * 1) Compute each root’s filtered subjects (non‐generic).
 * 2) Find intersection across all roots; search those subjects first.
 * 3) Then, for each root individually, search that root's filtered subjects to collect root‐specific recs.
 * 4) Finally, if still no recs for a particular root, do a simple title search on that root.
 * 5) Sort by # of matching roots (descending), then by title (A→Z).
 */
export async function fetchRecommendationsForBooks(queryBooks) {
  if (!Array.isArray(queryBooks) || queryBooks.length === 0) {
    return [];
  }

  const MAX = 10;
  const recsMap = {}; // workKey → { id, title, subjects, languages, matchingBookIds: Set }

  // 1) Build non‐generic subject lists for each root
  const bookFilteredSubjects = queryBooks.map((b) =>
    (b.subjects || [])
      .map((s) => s.toLowerCase())
      .filter((s) => !GENERIC_SUBJECTS.has(s))
  );

  // Helper to slugify a subject
  const slugify = (raw) =>
    raw
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, "_");

  // Helper: do a subject search, tagging each result with the provided set of root IDs
  async function subjectSearchAndTag(rootIdsSet, subj) {
    if (Object.keys(recsMap).length >= MAX) return;
    const slug = slugify(subj);
    if (!slug) return;
    const url = `https://openlibrary.org/search.json?subject="${encodeURIComponent(
      slug
    )}"&language=eng&limit=5`;
    try {
      const { data } = await axios.get(url);
      for (let d of data.docs || []) {
        if (!d.key || !d.title) continue;
        const workKey = d.key; // "/works/OL12345W"
        // If this rec is one of our roots, skip tagging
        if ([...rootIdsSet].includes(workKey)) continue;
        if (Object.keys(recsMap).length >= MAX) break;
        let entry = recsMap[workKey];
        if (!entry) {
          entry = {
            id: workKey,
            title: d.title,
            subjects: (d.subject || []).map((s) => s.toLowerCase()),
            languages: ["eng"],
            matchingBookIds: new Set(),
          };
          recsMap[workKey] = entry;
        }
        // Add all rootIds in rootIdsSet to this rec’s matchingBookIds
        rootIdsSet.forEach((rid) => entry.matchingBookIds.add(rid));
      }
    } catch {
      // ignore errors
    }
  }

  // 2) Intersection of all roots’ filtered subjects
  let intersection = [...bookFilteredSubjects[0]];
  for (let i = 1; i < bookFilteredSubjects.length; i++) {
    intersection = intersection.filter((s) => bookFilteredSubjects[i].includes(s));
  }

  // If there is an intersection, search those subjects and tag with ALL root IDs
  if (intersection.length > 0) {
    const allRootIds = new Set(queryBooks.map((b) => b.id));
    for (let subj of intersection) {
      if (Object.keys(recsMap).length >= MAX) break;
      await subjectSearchAndTag(allRootIds, subj);
    }
  }

  // 3) For each root individually, search its filtered subjects
  for (let i = 0; i < queryBooks.length; i++) {
    if (Object.keys(recsMap).length >= MAX) break;
    const rootBook = queryBooks[i];
    const rootId = rootBook.id;
    const filtered = bookFilteredSubjects[i];

    for (let subj of filtered) {
      if (Object.keys(recsMap).length >= MAX) break;
      await subjectSearchAndTag(new Set([rootId]), subj);
    }
  }

  // 4) After all subject‐searching, if ANY root still has zero recs, fallback to a title search on that root
  //    (We ensure every root gets at least some recommendations if none came from subjects.)
  for (let i = 0; i < queryBooks.length; i++) {
    if (Object.keys(recsMap).length >= MAX) break;
    const rootBook = queryBooks[i];
    const rootId = rootBook.id;

    // Check if this root already matched at least one rec:
    const rootHasRec = Object.values(recsMap).some((r) =>
      r.matchingBookIds.has(rootId)
    );
    if (rootHasRec) continue;

    // Perform title search on this root
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(
      rootBook.title
    )}&language=eng&limit=5`;
    try {
      const { data } = await axios.get(url);
      for (let d of data.docs || []) {
        if (!d.key || !d.title) continue;
        const workKey = d.key;
        if (workKey === rootId) continue;
        if (Object.keys(recsMap).length >= MAX) break;
        let entry = recsMap[workKey];
        if (!entry) {
          entry = {
            id: workKey,
            title: d.title,
            subjects: (d.subject || []).map((s) => s.toLowerCase()),
            languages: ["eng"],
            matchingBookIds: new Set(),
          };
          recsMap[workKey] = entry;
        }
        entry.matchingBookIds.add(rootId);
      }
    } catch {
      // ignore fallback errors
    }
  }

  // 5) Convert recsMap to array and sort:
  //    (a) by number of matchingBookIds descending (bridging recs first)
  //    (b) then by title A→Z
  const allRecs = Object.values(recsMap).map((e) => ({
    id: e.id,
    title: e.title,
    subjects: e.subjects,
    languages: e.languages,
    matchingBookIds: [...e.matchingBookIds],
  }));

  allRecs.sort((a, b) => {
    if (b.matchingBookIds.length !== a.matchingBookIds.length) {
      return b.matchingBookIds.length - a.matchingBookIds.length;
    }
    return a.title.localeCompare(b.title);
  });

  return allRecs.slice(0, MAX);
}
