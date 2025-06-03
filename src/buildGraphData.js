// src/buildGraphData.js

import { fetchRecommendationsForBooks } from "./api";

const MAX_RECS_PER_ROOT = 10;

export async function buildGraphData(queryBooks) {
  const nodes = [];
  const links = [];
  const seen = new Set();

  // 1) Add each root as a node
  queryBooks.forEach((b) => {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      nodes.push({
        id: b.id,
        label: b.title,
        type: "root",
        subjects: b.subjects.map((s) => s.toLowerCase()),
      });
    }
  });

  // 2) Fetch recs per root and merge into allRecsMap
  //    allRecsMap[r.id] = { id, title, subjects[], matchingBookIds: Set<rootID>, isIntersection: boolean }
  const allRecsMap = {};

  // Step A: Up to 10 recs for each root individually (value=1, thin gray links)
  for (let rootBook of queryBooks) {
    let recs = await fetchRecommendationsForBooks([rootBook]);
    recs = recs.slice(0, MAX_RECS_PER_ROOT);

    recs.forEach((r) => {
      const lowerSubjects = r.subjects.map((s) => s.toLowerCase());
      if (!allRecsMap[r.id]) {
        allRecsMap[r.id] = {
          id: r.id,
          title: r.title,
          subjects: lowerSubjects,
          matchingBookIds: new Set(r.matchingBookIds), // usually just [rootBook.id]
          isIntersection: false, // mark as “per‐root” initially
        };
      } else {
        // Already exists → union their root IDs (still not flagged as intersection unless Step B flips it)
        r.matchingBookIds.forEach((rid) => allRecsMap[r.id].matchingBookIds.add(rid));
      }
    });
  }

  // Step B: If ≥2 roots, fetch intersection recs (value=2, bold orange)
  if (queryBooks.length > 1) {
    let intersectionRecs = await fetchRecommendationsForBooks(queryBooks);
    intersectionRecs = intersectionRecs.slice(0, MAX_RECS_PER_ROOT);

    intersectionRecs.forEach((r) => {
      const lowerSubjects = r.subjects.map((s) => s.toLowerCase());
      const allRootIDs = queryBooks.map((b) => b.id);

      if (!allRecsMap[r.id]) {
        allRecsMap[r.id] = {
          id: r.id,
          title: r.title,
          subjects: lowerSubjects,
          matchingBookIds: new Set(allRootIDs),
          isIntersection: true, // mark as intersection
        };
      } else {
        // Already exists from Step A → ensure it’s flagged intersection and union in all root IDs
        allRootIDs.forEach((rid) => allRecsMap[r.id].matchingBookIds.add(rid));
        allRecsMap[r.id].isIntersection = true;
      }
    });
  }

  // 3) Sort recs by how many roots they match (descending)
  const allRecsArray = Object.values(allRecsMap).sort(
    (a, b) => b.matchingBookIds.size - a.matchingBookIds.size
  );

  // 4) Add each rec node exactly once
  allRecsArray.forEach((recEntry) => {
    if (!seen.has(recEntry.id)) {
      seen.add(recEntry.id);
      nodes.push({
        id: recEntry.id,
        label: recEntry.title,
        type: "rec",
        subjects: recEntry.subjects,
        matchingBookIds: Array.from(recEntry.matchingBookIds),
        isIntersection: recEntry.isIntersection,
      });
    }
  });

  // 5) Create root→rec links:
  //    - value=2 (bold orange) if recEntry.isIntersection === true
  //    - value=1 (thin gray) otherwise
  allRecsArray.forEach((recEntry) => {
    recEntry.matchingBookIds.forEach((rootId) => {
      links.push({
        source: rootId,
        target: recEntry.id,
        value: recEntry.isIntersection ? 2 : 1,
      });
    });
  });

  return { nodes, links };
}
