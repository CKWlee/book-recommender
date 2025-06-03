// src/PlusButton.jsx
import React from "react";
import "./index.css"; // uses .plus-button

function PlusButton({ onAddBook }) {
  return <div className="plus-button" onClick={onAddBook}>+</div>;
}

export default PlusButton;
