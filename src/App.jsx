import React, { useState } from "react";
import SearchBar from "./SearchBar";
import GraphView from "./GraphView";
import PlusButton from "./PlusButton";
import { buildGraphData } from "./buildGraphData";
import { fetchWorkByID } from "./api";

function App() {
  // queryBooks is an array of { id, title, subjects }
  const [queryBooks, setQueryBooks] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [showSearch, setShowSearch] = useState(true);

  // Called when user selects a suggestion { key, title }
  async function handleBookSearch(hit) {
    // Fetch full work details (subjects) by ID
    const workObj = await fetchWorkByID(hit.key);
    if (!workObj) {
      alert('Could not fetch details for "' + hit.title + '"');
      return;
    }

    // Add this work object to our state array
    const updatedQueries = [...queryBooks, workObj];
    setQueryBooks(updatedQueries);

    // Rebuild graphData (nodes + links) by passing in work-objects
    const newGraph = await buildGraphData(updatedQueries);
    setGraphData(newGraph);

    // Hide the search UI, show the graph
    setShowSearch(false);
  }

  // Show the search UI again
  function handleAddBook() {
    setShowSearch(true);
  }

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {showSearch ? (
        <SearchBar onBookSearch={handleBookSearch} />
      ) : (
        <>
          {/* GraphView (SVG) */}
          <GraphView graphData={graphData} />

          {/* Static Legend */}
          <div className="legend">
            <div className="legend-item">
              <span className="legend-color warm"></span>
              Warm: ≥ 2 connections
            </div>
            <div className="legend-item">
              <span className="legend-color cold"></span>
              Cold: 1 connection
            </div>
          </div>

          {/* “+” button to add another book */}
          <PlusButton onAddBook={handleAddBook} />
        </>
      )}
    </div>
  );
}

export default App;
