// src/GraphView.jsx
import React, { useRef, useEffect } from "react";
import * as d3 from "d3";

/**
 * GraphView renders a force‐directed network with:
 * - A continuous “cold→warm” color gradient based on connection count.
 * - A matching gradient legend in the top‐left corner that remains fixed while zooming/panning.
 * - Strong repulsion and large collision radii for better node separation.
 * - Curved SVG links, draggable nodes, and pan/zoom functionality.
 */
export default function GraphView({ graphData }) {
  const svgRef = useRef();

  useEffect(() => {
    if (!graphData.nodes.length) return;

    // 1) SVG setup
    const width = window.innerWidth;
    const height = window.innerHeight;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // 2) <defs>: drop‐shadow + legend gradient
    const defs = svg.append("defs");

    // 2a) Drop‐shadow filter
    const filter = defs.append("filter").attr("id", "dropShadow");
    filter
      .append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 2)
      .attr("stdDeviation", 3)
      .attr("flood-color", "#000")
      .attr("flood-opacity", 0.15);

    // 2b) Linear gradient (cold→warm) for legend
    const legendGrad = defs.append("linearGradient").attr("id", "legendGradient");
    legendGrad
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#ADD8E6"); // lightblue
    legendGrad
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#FF4500"); // orangered

    // 3) Create a fixed legend group appended directly to <svg> (so it doesn’t move on zoom)
    const legendWidth = 180;
    const legendHeight = 12;
    const legendX = 20;
    const legendY = 20;

    const legendGroup = svg.append("g").attr("class", "legend")
      .attr("transform", `translate(${legendX}, ${legendY})`);

    // 3a) Background rectangle behind legend
    legendGroup
      .append("rect")
      .attr("x", -8)
      .attr("y", -20)
      .attr("width", legendWidth + 16)
      .attr("height", 40)
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "rgba(255,255,255,0.8)");

    // 3b) Legend title
    legendGroup
      .append("text")
      .attr("x", 0)
      .attr("y", -4)
      .attr("font-size", "14px")
      .attr("fill", "#333")
      .text("Connections (cold → warm)");

    // 3c) Gradient bar
    legendGroup
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", "url(#legendGradient)")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);

    // 3d) “1” label on left
    legendGroup
      .append("text")
      .attr("x", 0)
      .attr("y", legendHeight + 20)
      .attr("font-size", "12px")
      .attr("fill", "#333")
      .text("1");

    // 3e) `maxCount` label on right (placeholder for now; updated below)
    const maxLabel = legendGroup
      .append("text")
      .attr("x", legendWidth)
      .attr("y", legendHeight + 20)
      .attr("text-anchor", "end")
      .attr("font-size", "12px")
      .attr("fill", "#333")
      .text("0"); // will set correct value later

    // 4) Enable zoom & pan, transforming only the graph‐content group
    svg.call(
      d3
        .zoom()
        .scaleExtent([0.2, 3])
        .on("zoom", (event) => {
          container.attr("transform", event.transform);
        })
    );

    // 5) Container group that will actually be zoomed/panned
    const container = svg.append("g").attr("class", "graph-content");

    // 6) Compute how many “root” connections each node has
    const nodeTypeMap = {};
    graphData.nodes.forEach((n) => {
      nodeTypeMap[n.id] = n.type;
    });

    const connectionCount = {};
    graphData.nodes.forEach((n) => {
      connectionCount[n.id] = 0;
    });

    graphData.links.forEach((link) => {
      const sid = typeof link.source === "object" ? link.source.id : link.source;
      const tid = typeof link.target === "object" ? link.target.id : link.target;
      const sType = nodeTypeMap[sid];
      const tType = nodeTypeMap[tid];

      if (sType === "root" && tType !== "root") {
        connectionCount[tid] += 1;
      } else if (tType === "root" && sType !== "root") {
        connectionCount[sid] += 1;
      } else if (sType === "root" && tType === "root") {
        connectionCount[sid] += 1;
        connectionCount[tid] += 1;
      }
    });

    // 7) Determine max connections for color scale
    const counts = Object.values(connectionCount);
    const maxCount = counts.length ? Math.max(...counts) : 1;
    maxLabel.text(String(maxCount)); // update the legend’s right label

    // 8) Continuous color scale from 1 → maxCount
    const colorScale = d3
      .scaleLinear()
      .domain([1, maxCount])
      .range(["#ADD8E6", "#FF4500"])
      .clamp(true);

    const nodeColor = (id) => {
      const cnt = connectionCount[id] || 0;
      return cnt <= 1 ? "#ADD8E6" : colorScale(cnt);
    };

    // 9) Force simulation with strong repulsion & collision radii
    const simulation = d3
      .forceSimulation(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink(graphData.links)
          .id((d) => d.id)
          .distance((d) => (d.value === 2 ? 300 : 250))
          .strength(0.7)
      )
      .force("charge", d3.forceManyBody().strength(-1000))
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((d) => (d.type === "root" ? 70 : 60))
          .strength(1)
      )
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.01))
      .force("x", d3.forceX(width / 2).strength(0.002))
      .force("y", d3.forceY(height / 2).strength(0.002));

    // 10) Draw curved links inside the zoomable container
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(graphData.links)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke-width", (d) => (d.value === 2 ? 4 : 2))
      .attr("stroke", (d) => (d.value === 2 ? "#FF8C00" : "#AAA"))
      .attr("opacity", 0);

    // 11) Draw nodes (circle + text) inside the zoomable container
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
          .attr("r", d.type === "root" ? 75 : 65);
      })
      .on("mouseout", function (event, d) {
        d3.select(this)
          .select("circle")
          .transition()
          .attr("r", d.type === "root" ? 70 : 60);
      });

    node
      .append("circle")
      .attr("r", 0)
      .attr("fill", (d) => nodeColor(d.id))
      .attr("stroke", "#555")
      .attr("stroke-width", 1)
      .attr("opacity", 0.9)
      .attr("filter", "url(#dropShadow)");

    node
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.type === "root" ? 8 : 6))
      .attr("font-size", (d) => (d.type === "root" ? "20px" : "18px"))
      .attr("fill", "#000")
      .attr("pointer-events", "none")
      .attr("opacity", 0)
      .call((text) =>
        text.each(function (d) {
          const el = d3.select(this);
          const txt = d.label;
          if (txt.length > 18) {
            el.text(txt.slice(0, 18) + "…");
          }
        })
      );

    // 12) Animate links into view
    link
      .transition()
      .delay((d, i) => i * 20)
      .duration(700)
      .attr("opacity", 1);

    // 13) Animate circles into view
    node
      .selectAll("circle")
      .transition()
      .delay((d, i) => i * 30)
      .duration(700)
      .attr("r", (d) => (d.type === "root" ? 70 : 60))
      .attr("opacity", 1);

    // 14) Animate text labels into view
    node
      .selectAll("text")
      .transition()
      .delay((d, i) => i * 30 + 150)
      .duration(700)
      .attr("opacity", 1);

    // 15) Enable node dragging (fix at release)
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
        d.fx = event.x;
        d.fy = event.y;
      });

    dragHandler(node);

    // 16) On each simulation tick, update link arcs & node positions
    simulation.on("tick", () => {
      link.attr("d", (d) => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; // larger curvature
        return `
          M${d.source.x},${d.source.y}
          A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}
        `;
      });

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // 17) Cleanup on unmount
    return () => simulation.stop();
  }, [graphData]);

  return <svg ref={svgRef} width="100%" height="100%" />;
}
