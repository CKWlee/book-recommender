// src/GraphView.jsx
import React, { useRef, useEffect } from "react";
import * as d3 from "d3";

/**
 * GraphView draws a D3 force‐directed graph with:
 * - Stronger repulsion (so nodes start farther apart)
 * - Larger collision radius (to keep nodes from overlapping)
 * - Pan & zoom (drag blank space to move the entire graph)
 * - Curved links (SVG arcs)
 * - “Warm”/“Cold” coloring based on connections
 * - Draggable nodes (click + drag to reposition any node)
 * - Larger node radii & dark text for readability
 */
function GraphView({ graphData }) {
  const svgRef = useRef();

  useEffect(() => {
    if (!graphData.nodes.length) return;

    // 1) Basic SVG setup
    const width = window.innerWidth;
    const height = window.innerHeight;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // clear any previous content

    // 2) Append drop-shadow filter in <defs>
    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "dropShadow");
    filter
      .append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 2)
      .attr("stdDeviation", 3)
      .attr("flood-color", "#000")
      .attr("flood-opacity", 0.15);

    // 3) Make everything zoomable/pannable
    //    You can now click-drag any blank space to pan the graph.
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.3, 2])
        .on("zoom", (event) => {
          svg.selectAll("g.graph-content").attr("transform", event.transform);
        })
    );

    // 4) Create a <g> group to contain all links + nodes
    //    so that zoom/pan transforms them together
    const container = svg.append("g").attr("class", "graph-content");

    // 5) Compute connection counts for each node (how many query-book links)
    const nodeTypeMap = {};
    graphData.nodes.forEach((n) => {
      nodeTypeMap[n.id] = n.type;
    });

    // Initialize all counts to 0
    const connectionCount = {};
    graphData.nodes.forEach((n) => {
      connectionCount[n.id] = 0;
    });

    // Count connections: for each link, if it touches a query node, increment the OTHER side
    graphData.links.forEach((link) => {
      const sid =
        typeof link.source === "object" ? link.source.id : link.source;
      const tid =
        typeof link.target === "object" ? link.target.id : link.target;

      const sType = nodeTypeMap[sid];
      const tType = nodeTypeMap[tid];

      if (sType === "query" && tType !== "query") {
        connectionCount[tid] += 1;
      } else if (tType === "query" && sType !== "query") {
        connectionCount[sid] += 1;
      } else if (sType === "query" && tType === "query") {
        connectionCount[sid] += 1;
        connectionCount[tid] += 1;
      }
    });

    // 6) Helper to pick color based on connectionCount: >=2 → warm (lightcoral), else cold (lightblue)
    const nodeColor = (id) => {
      return connectionCount[id] >= 2 ? "lightcoral" : "lightblue";
    };

    // 7) Set up the force simulation with stronger repulsion & bigger collision
    const simulation = d3
      .forceSimulation(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink(graphData.links)
          .id((d) => d.id)
          .distance((d) => (d.value === 2 ? 200 : 140)) // slightly longer links
          .strength(0.7)
      )
      // Increase negative strength so nodes push farther apart
      .force("charge", d3.forceManyBody().strength(-300))
      // Increase collision radius so nodes keep more distance
      .force(
        "collide",
        d3.forceCollide().radius((d) => (d.type === "query" ? 50 : 40)).strength(0.9)
      )
      // Weaken center pull so graph drifts more freely
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.02))
      // Slight x/y drift
      .force("x", d3.forceX(width / 2).strength(0.005))
      .force("y", d3.forceY(height / 2).strength(0.005));

    // 8) Draw curved links as <path>
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(graphData.links)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke-width", (d) => (d.value === 2 ? 4 : 2))
      .attr("stroke", (d) => (d.value === 2 ? "#ffb300" : "#ccc"))
      .attr("opacity", 0);

    // 9) Create node groups (<g>) for circle + text
    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graphData.nodes)
      .enter()
      .append("g")
      .attr("class", "node-group")
      .on("mouseover", function (event, d) {
        d3.select(this)
          .select("circle")
          .transition()
          .attr("r", (d) => (d.type === "query" ? 58 : 48));
      })
      .on("mouseout", function (event, d) {
        d3.select(this)
          .select("circle")
          .transition()
          .attr("r", (d) => (d.type === "query" ? 50 : 40));
      });

    node
      .append("circle")
      .attr("r", 0)
      .attr("fill", (d) => nodeColor(d.id))
      .attr("stroke", "#555")
      .attr("stroke-width", 1)
      .attr("opacity", 0)
      .attr("filter", "url(#dropShadow)");

    node
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.type === "query" ? 7 : 5))
      .attr("font-size", (d) => (d.type === "query" ? "16px" : "14px"))
      .attr("fill", "#000") // dark text for contrast
      .attr("pointer-events", "none")
      .attr("opacity", 0)
      .call((text) =>
        text.each(function (d) {
          // Trim to ~16 characters if too long
          const el = d3.select(this);
          let txt = d.label;
          if (txt.length > 16) {
            el.text(txt.slice(0, 16) + "…");
          }
        })
      );

    // 10) Animate curved links into view
    link
      .transition()
      .delay((d, i) => i * 20)
      .duration(600)
      .attr("opacity", 1);

    // 11) Animate circles (radius + opacity)
    node
      .selectAll("circle")
      .transition()
      .delay((d, i) => i * 30)
      .duration(600)
      .attr("r", (d) => (d.type === "query" ? 50 : 40))
      .attr("opacity", 1);

    // 12) Animate text labels
    node
      .selectAll("text")
      .transition()
      .delay((d, i) => i * 30 + 120)
      .duration(600)
      .attr("opacity", 1);

    // 13) Define drag behavior so nodes can be moved manually
    const dragHandler = d3
      .drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    dragHandler(node);

    // 14) On each tick of the simulation, update node positions & link paths
    simulation.on("tick", () => {
      link.attr("d", (d) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.2; // curve radius
        return `
          M${d.source.x},${d.source.y}
          A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}
        `;
      });

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // 15) Cleanup on unmount
    return () => simulation.stop();
  }, [graphData]);

  return <svg ref={svgRef} />;
}

export default GraphView;
