import { fetchRecommendationsForBook } from "./api";

/**
 * Given an array of work‐objects:
 *   [
 *     { id: "/works/OL45883W", title: "Dune", subjects: [ "Science Fiction", ... ] },
 *     { id: "/works/OL74234W", title: "Neuromancer", subjects: [ "Science Fiction", ... ] },
 *     ...
 *   ]
 * buildGraphData fetches recommendations for each work, then returns { nodes, links }.
 */
export async function buildGraphData(queryBooks) {
  // queryBooks is already an array of { id, title, subjects } objects

  const nodes = [];
  const links = [];
  const nodeMap = {}; // key: node.id → node object ({ id, label, type, subjects })

  // Add each queryBook as a “query” node
  queryBooks.forEach((book) => {
    if (!nodeMap[book.id]) {
      nodeMap[book.id] = {
        id: book.id,
        label: book.title,
        type: "query",
        subjects: book.subjects,
      };
      nodes.push(nodeMap[book.id]);
    }
  });

  // For each queryBook, fetch its recs (array of { id, title, subjects })
  for (let book of queryBooks) {
    const recs = await fetchRecommendationsForBook(book);
    recs.forEach((rec) => {
      if (!nodeMap[rec.id]) {
        nodeMap[rec.id] = {
          id: rec.id,
          label: rec.title,
          type: "rec",
          subjects: rec.subjects,
        };
        nodes.push(nodeMap[rec.id]);
      }
      links.push({
        source: book.id,
        target: rec.id,
        value: 1,
      });
    });
  }

  // If two (or more) queryBooks share any subject, link them directly (value=2)
  if (queryBooks.length > 1) {
    for (let i = 0; i < queryBooks.length; i++) {
      for (let j = i + 1; j < queryBooks.length; j++) {
        const A = queryBooks[i];
        const B = queryBooks[j];
        const shared = A.subjects.filter((s) => B.subjects.includes(s));
        if (shared.length > 0) {
          links.push({
            source: A.id,
            target: B.id,
            value: 2, // thicker/different link
          });
        }
      }
    }
  }

  return { nodes, links };
}
