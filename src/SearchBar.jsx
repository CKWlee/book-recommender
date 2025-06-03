import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./index.css"; // ensure the CSS below is added to index.css

/**
 * AUTOCOMPLETE SearchBar:
 * - As the user types, fetch up to 5 matching works from Open Library.
 * - Display those titles in a dropdown.
 * - When the user chooses one, invoke onBookSearch({ key, title }) with the chosen work.
 */
function SearchBar({ onBookSearch }) {
  const [input, setInput] = useState("");
  const [animationClass, setAnimationClass] = useState("search-container hidden");

  // Holds the “autocomplete” hits: array of { key: "/works/OLxxxW", title: "Some Book" }
  const [suggestions, setSuggestions] = useState([]);

  // To close the suggestions list when clicking outside
  const containerRef = useRef(null);

  useEffect(() => {
    // Fade‐in on mount
    setAnimationClass("search-container visible");
  }, []);

  useEffect(() => {
    // Whenever input changes, fetch suggestions (debounced 300ms)
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const res = await axios.get(
          `https://openlibrary.org/search.json?title=${encodeURIComponent(input.trim())}&limit=5`,
          { signal: controller.signal }
        );
        const docs = res.data.docs || [];
        // Map to { key, title }
        const hits = docs.map((d) => ({
          key: d.key, // e.g. "/works/OLxxxxxW"
          title: d.title,
        }));
        setSuggestions(hits);
      } catch (err) {
        if (err.name !== "CanceledError") {
          console.error("Autocomplete error:", err.message);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [input]);

  // Close the suggestion list if user clicks outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    // If the user typed a free text and pressed “Enter” without picking one suggestion:
    // default to the first suggestion if available
    if (suggestions.length > 0) {
      const firstHit = suggestions[0];
      pickSuggestion(firstHit);
    }
  };

  // When user clicks a suggestion from the list
  const pickSuggestion = async (hit) => {
    setSuggestions([]);
    setInput(hit.title);
    // Fade‐out the search UI
    setAnimationClass("search-container hidden");
    // Wait for the fade‐out to finish before triggering onBookSearch
    setTimeout(() => {
      onBookSearch({ key: hit.key, title: hit.title });
      setInput("");
    }, 300);
  };

  return (
    <div className={animationClass} ref={containerRef}>
      {/* Swap this title with any catchy phrase */}
      <h1 className="search-title">“Your Next Great Adventure Awaits”</h1>

      <form onSubmit={handleSubmit} className="search-form" autoComplete="off">
        <input
          type="text"
          placeholder="e.g., The Hobbit"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="search-input"
          autoFocus
        />
        <button type="submit" className="search-button">
          →
        </button>
      </form>

      {/* Autocomplete dropdown */}
      {suggestions.length > 0 && (
        <ul className="suggestions-list">
          {suggestions.map((hit) => (
            <li
              key={hit.key}
              className="suggestion-item"
              onClick={() => pickSuggestion(hit)}
            >
              {hit.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SearchBar;
