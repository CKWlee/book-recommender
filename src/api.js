// src/api.js
import axios from "axios";

// A set of generic subjects to skip—too broad, leads to unhelpful recommendations.
const GENERIC_SUBJECTS = new Set([
  "novels",
  "fiction",
  "american literature",
  "children's literature",
  "biography",
  "autobiography",
  "literature",
  // Add more overly broad tags here if needed
]);

/**
 * Given a book title string, search Open Library for the first matching work.
 * Returns an object { id, title, subjects } or null if not found.
 */
export async function fetchBookAndSubjects(title) {
  try {
    // 1) Search by title (limit=1)
    const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(
      title
    )}&limit=1`;
    const searchRes = await axios.get(searchUrl);

    if (!searchRes.data.docs || searchRes.data.docs.length === 0) {
      throw new Error("No books found for title: " + title);
    }

    const doc = searchRes.data.docs[0];
    // doc.key is like "/works/OL45883W"
    const workKey = doc.key;

    // 2) Fetch the work’s details to get its subjects
    const workUrl = `https://openlibrary.org${workKey}.json`;
    const workRes = await axios.get(workUrl);
    const workData = workRes.data;

    const subjects = workData.subjects || [];
    return {
      id: workKey,                     // e.g. "/works/OL45883W"
      title: workData.title || doc.title,
      subjects: subjects.slice(0, 5),  // keep top 5 subjects
    };
  } catch (err) {
    console.error("Error in fetchBookAndSubjects:", err.message);
    return null;
  }
}

/**
 * Given a work ID (e.g. "/works/OL45883W"), fetch that work’s details directly.
 * Returns { id, title, subjects } or null if not found.
 */
export async function fetchWorkByID(workKey) {
  try {
    // workKey already begins with "/works/OLxxxxxW"
    const workUrl = `https://openlibrary.org${workKey}.json`;
    const workRes = await axios.get(workUrl);
    const workData = workRes.data;

    const subjects = workData.subjects || [];
    return {
      id: workKey,
      title: workData.title,
      subjects: subjects.slice(0, 5),
    };
  } catch (err) {
    console.error("Error in fetchWorkByID:", err.message);
    return null;
  }
}

/**
 * Given one book‐object { id, title, subjects }, fetch up to 5 related works per subject.
 * - Skips any subject in GENERIC_SUBJECTS.
 * - Computes overlapCount = how many subjects each candidate shares.
 * - Keeps any candidate with overlapCount ≥ 1.
 * - Sorts by overlapCount descending (best matches first).
 * - Returns up to 10 recs.
 *
 * Returns array of { id, title, subjects, overlapCount }.
 */
export async function fetchRecommendationsForBook(book) {
  const allRecsMap = {}; // recId → { id, title, subjects, overlapCount }
  const querySubjectsSet = new Set(book.subjects.map((s) => s.toLowerCase()));

  for (let rawSubject of book.subjects) {
    const normalized = rawSubject.toLowerCase();
    if (GENERIC_SUBJECTS.has(normalized)) {
      // Skip overly broad subjects
      continue;
    }

    // Normalize for URL: lowercase, strip punctuation, spaces → underscores
    const subjKey = normalized
      .replace(/[^a-z0-9 ]/g, "")  // remove punctuation
      .replace(/ /g, "_");         // spaces → underscores

    try {
      const subjectRes = await axios.get(
        `https://openlibrary.org/subjects/${encodeURIComponent(subjKey)}.json?limit=5`
      );
      const works = subjectRes.data.works || [];

      works.forEach((w) => {
        const recId = w.key; // e.g., "/works/OL12345W"
        if (recId === book.id) return; // do not recommend the original book

        // Capture up to 5 subjects from this candidate
        const recSubjects = (w.subject || []).slice(0, 5).map((s) => s.toLowerCase());

        // Count how many subjects overlap
        const overlapCount = recSubjects.reduce(
          (count, subj) => (querySubjectsSet.has(subj) ? count + 1 : count),
          0
        );

        // Only keep candidates with at least one shared subject
        if (overlapCount >= 1) {
          if (!allRecsMap[recId]) {
            allRecsMap[recId] = {
              id: recId,
              title: w.title,
              subjects: recSubjects,
              overlapCount,
            };
          } else {
            // If the same rec appears under multiple subjects, keep the max overlapCount
            allRecsMap[recId].overlapCount = Math.max(
              allRecsMap[recId].overlapCount,
              overlapCount
            );
          }
        }
      });
    } catch (e) {
      console.warn(`No recs for subject "${rawSubject}"`, e.message);
    }
  }

  // Convert the map to an array and sort by overlapCount descending
  const recArray = Object.values(allRecsMap);
  recArray.sort((a, b) => b.overlapCount - a.overlapCount);

  // Return up to 10 recommendations
  return recArray.slice(0, 10);
}
