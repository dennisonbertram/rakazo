import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { parsePlotData, PLOT_TOOL_GUIDE, renderPlotSpecToSvg, supportedPlotNames } from "./plot-tool.js";

const dom = () => new JSDOM("").window.document;

const penguinish = [
  { length: 39.1, depth: 18.7, species: "Adelie", island: "Torgersen" },
  { length: 46.5, depth: 17.9, species: "Chinstrap", island: "Dream" },
  { length: 50.0, depth: 15.2, species: "Gentoo", island: "Biscoe" },
  { length: 41.3, depth: 19.1, species: "Adelie", island: "Dream" },
  { length: 48.7, depth: 14.1, species: "Gentoo", island: "Biscoe" },
];

describe("render_plot", () => {
  it("renders a titled scatterplot with a categorical legend into standalone SVG", () => {
    const svg = renderPlotSpecToSvg(
      {
        title: "Culmen shape by species",
        marks: [{ type: "dot", options: { x: "length", y: "depth", stroke: "species" } }],
      },
      penguinish,
      dom(),
    );
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg).toContain("Culmen shape by species");
    for (const species of ["Adelie", "Chinstrap", "Gentoo"]) expect(svg).toContain(species);
    expect(svg).toContain("circle");
  });

  it("supports transforms: binned histogram and grouped stacked bars", () => {
    const histogram = renderPlotSpecToSvg(
      {
        marks: [
          {
            type: "rectY",
            transform: { name: "binX", outputs: { y: "count" } },
            options: { x: "length", fill: "species" },
          },
          { type: "ruleY", data: [0] },
        ],
      },
      penguinish,
      dom(),
    );
    expect(histogram).toContain("rect");
    const grouped = renderPlotSpecToSvg(
      {
        marks: [
          {
            type: "barY",
            transform: { name: "groupX", outputs: { y: "count" } },
            options: { x: "island", fill: "species" },
          },
        ],
      },
      penguinish,
      dom(),
    );
    expect(grouped).toContain("rect");
  });

  it("supports facets", () => {
    const svg = renderPlotSpecToSvg(
      {
        marks: [{ type: "dot", options: { x: "length", y: "depth", fx: "island" } }],
      },
      penguinish,
      dom(),
    );
    for (const island of ["Torgersen", "Dream", "Biscoe"]) expect(svg).toContain(island);
  });

  it("rejects unknown marks and transforms with the supported lists", () => {
    expect(() =>
      renderPlotSpecToSvg({ marks: [{ type: "evilMark" }] }, penguinish, dom()),
    ).toThrow(/Unsupported mark type "evilMark"/);
    expect(() =>
      renderPlotSpecToSvg(
        { marks: [{ type: "dot", transform: { name: "eval" }, options: {} }] },
        penguinish,
        dom(),
      ),
    ).toThrow(/Unsupported transform "eval"/);
    expect(supportedPlotNames().marks).toContain("dot");
    expect(supportedPlotNames().transforms).toContain("binX");
  });

  it("parses csv with automatic typing and json row arrays", () => {
    const rows = parsePlotData("data.csv", "a,b\n1,2024-01-05\n2,2024-02-05\n") as {
      a: number;
      b: Date;
    }[];
    expect(rows[0]?.a).toBe(1);
    expect(rows[0]?.b instanceof Date).toBe(true);
    expect(parsePlotData("rows.json", '[{"x":1}]')).toEqual([{ x: 1 }]);
    expect(() => parsePlotData("rows.json", '{"x":1}')).toThrow(/top-level array/);
  });

  it("ships a guide that teaches the agent how to call the tool", () => {
    expect(PLOT_TOOL_GUIDE).toContain("How to use the tool");
    expect(PLOT_TOOL_GUIDE).toContain("data_path");
    expect(PLOT_TOOL_GUIDE).toContain("Chart catalog");
    expect(PLOT_TOOL_GUIDE).toContain('{"help": true}');
  });
});
