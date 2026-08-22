import * as Plot from "@observablehq/plot";
import { autoType, csvParse, tsvParse } from "d3-dsv";

/**
 * Declarative, JSON-only surface over Observable Plot for the render_plot
 * agent tool. Marks and transforms are allowlisted by name; specs carry plain
 * data and options, never code, so rendering stays safe server-side.
 */

export type PlotMarkSpec = {
  type: string;
  /** Per-mark data override; falls back to the spec-level data. */
  data?: unknown[];
  /** Mark channel options: x, y, stroke, fill, fx, fy, sort, tip, … */
  options?: Record<string, unknown>;
  /** Optional transform wrapping the options, e.g. {name:"binX", outputs:{y:"count"}}. */
  transform?: { name: string; outputs?: Record<string, unknown> };
};

export type PlotSpec = {
  title?: string;
  width?: number;
  height?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  marginBottom?: number;
  grid?: boolean;
  inset?: number;
  aspectRatio?: number;
  x?: Record<string, unknown>;
  y?: Record<string, unknown>;
  fx?: Record<string, unknown>;
  fy?: Record<string, unknown>;
  facet?: Record<string, unknown>;
  color?: Record<string, unknown>;
  r?: Record<string, unknown>;
  opacity?: Record<string, unknown>;
  symbol?: Record<string, unknown>;
  length?: Record<string, unknown>;
  projection?: unknown;
  style?: Record<string, unknown>;
  marks: PlotMarkSpec[];
};

type MarkFactory = (data: unknown, options: Record<string, unknown>) => Plot.Markish;

const DATA_MARKS = {
  area: Plot.area,
  areaX: Plot.areaX,
  areaY: Plot.areaY,
  arrow: Plot.arrow,
  barX: Plot.barX,
  barY: Plot.barY,
  boxX: Plot.boxX,
  boxY: Plot.boxY,
  cell: Plot.cell,
  cellX: Plot.cellX,
  cellY: Plot.cellY,
  circle: Plot.circle,
  cluster: Plot.cluster,
  contour: Plot.contour as unknown as MarkFactory,
  delaunayLink: Plot.delaunayLink,
  delaunayMesh: Plot.delaunayMesh,
  density: Plot.density,
  dot: Plot.dot,
  dotX: Plot.dotX,
  dotY: Plot.dotY,
  hull: Plot.hull,
  image: Plot.image,
  line: Plot.line,
  lineX: Plot.lineX,
  lineY: Plot.lineY,
  linearRegressionX: Plot.linearRegressionX,
  linearRegressionY: Plot.linearRegressionY,
  link: Plot.link,
  raster: Plot.raster as unknown as MarkFactory,
  rect: Plot.rect,
  rectX: Plot.rectX,
  rectY: Plot.rectY,
  ruleX: Plot.ruleX,
  ruleY: Plot.ruleY,
  spike: Plot.spike,
  text: Plot.text,
  textX: Plot.textX,
  textY: Plot.textY,
  tickX: Plot.tickX,
  tickY: Plot.tickY,
  tree: Plot.tree,
  vector: Plot.vector,
  vectorX: Plot.vectorX,
  vectorY: Plot.vectorY,
  voronoi: Plot.voronoi,
  voronoiMesh: Plot.voronoiMesh,
  waffleX: Plot.waffleX,
  waffleY: Plot.waffleY,
} as unknown as Record<string, MarkFactory>;

const DATALESS_MARKS = {
  axisX: Plot.axisX,
  axisY: Plot.axisY,
  frame: Plot.frame,
  gridX: Plot.gridX,
  gridY: Plot.gridY,
  hexgrid: Plot.hexgrid,
  sphere: Plot.sphere,
  graticule: Plot.graticule,
} as unknown as Record<string, (options: Record<string, unknown>) => Plot.Markish>;

type TransformFactory = (
  outputs: Record<string, unknown>,
  options: Record<string, unknown>,
) => Record<string, unknown>;

const TRANSFORMS = {
  bin: Plot.bin,
  binX: Plot.binX,
  binY: Plot.binY,
  group: Plot.group,
  groupX: Plot.groupX,
  groupY: Plot.groupY,
  groupZ: Plot.groupZ,
  hexbin: Plot.hexbin,
  normalizeX: Plot.normalizeX,
  normalizeY: Plot.normalizeY,
  windowX: Plot.windowX,
  windowY: Plot.windowY,
  stackX: Plot.stackX,
  stackY: Plot.stackY,
  dodgeX: Plot.dodgeX,
  dodgeY: Plot.dodgeY,
  shiftX: Plot.shiftX,
  select: Plot.select,
} as unknown as Record<string, TransformFactory>;

export function supportedPlotNames(): { marks: string[]; transforms: string[] } {
  return {
    marks: [...Object.keys(DATA_MARKS), ...Object.keys(DATALESS_MARKS)].sort(),
    transforms: Object.keys(TRANSFORMS).sort(),
  };
}

function buildMark(mark: PlotMarkSpec, sharedData: unknown[] | undefined): Plot.Markish {
  const options = { ...(mark.options ?? {}) };
  const dataless = DATALESS_MARKS[mark.type];
  if (dataless) return dataless(options);
  const factory = DATA_MARKS[mark.type];
  if (!factory) {
    throw new Error(
      `Unsupported mark type "${mark.type}". Supported marks: ${supportedPlotNames().marks.join(", ")}`,
    );
  }
  const data = mark.data ?? sharedData;
  if (!data) throw new Error(`Mark "${mark.type}" has no data and the spec has no shared data.`);
  let finalOptions: Record<string, unknown> = options;
  if (mark.transform) {
    const transform = TRANSFORMS[mark.transform.name];
    if (!transform) {
      throw new Error(
        `Unsupported transform "${mark.transform.name}". Supported transforms: ${supportedPlotNames().transforms.join(", ")}`,
      );
    }
    finalOptions = transform(mark.transform.outputs ?? {}, options);
  }
  return factory(data, finalOptions);
}

export function parsePlotData(name: string, content: string): unknown[] {
  if (/\.csv$/i.test(name)) return csvParse(content, autoType);
  if (/\.tsv$/i.test(name)) return tsvParse(content, autoType);
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) throw new Error("JSON data files must contain a top-level array of rows");
  return parsed;
}

const XMLNS = "http://www.w3.org/2000/xmlns/";

/** Render a spec to a standalone SVG string using the provided DOM document. */
export function renderPlotSpecToSvg(
  spec: PlotSpec,
  data: unknown[] | undefined,
  document: Document,
): string {
  if (!Array.isArray(spec.marks) || spec.marks.length === 0) {
    throw new Error("The spec needs a non-empty marks array.");
  }
  const { title, marks, ...plotOptions } = spec;
  for (const scale of ["color", "x", "y", "fx", "fy", "r", "opacity", "symbol"] as const) {
    const options = plotOptions[scale];
    // Plot renders legends/titles as HTML <figure> wrappers, which cannot
    // rasterize to a standalone image; we compose title and swatches in SVG.
    if (options && typeof options === "object") delete (options as { legend?: unknown }).legend;
  }
  const plotted = Plot.plot({
    document,
    ...(plotOptions as Plot.PlotOptions),
    marks: marks.map((mark) => buildMark(mark, data)),
  });
  const svg = plotted.tagName === "svg" ? plotted : plotted.querySelector("svg");
  if (!svg) throw new Error("Plot did not produce an SVG element");
  const width = Number(svg.getAttribute("width") ?? spec.width ?? 640);
  const height = Number(svg.getAttribute("height") ?? spec.height ?? 400);

  const colorScale = (plotted as unknown as { scale?: (name: string) => Plot.Scale | undefined })
    .scale?.("color");
  const swatches = categoricalSwatches(colorScale);
  const titleHeight = title ? 28 : 0;
  const legendHeight = swatches.length > 0 ? 24 : 0;
  const totalHeight = height + titleHeight + legendHeight;

  svg.setAttributeNS(XMLNS, "xmlns", "http://www.w3.org/2000/svg");
  svg.setAttributeNS(XMLNS, "xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("y", String(titleHeight + legendHeight));
  const header: string[] = [];
  if (title) {
    header.push(
      `<text x="8" y="19" font-family="system-ui, sans-serif" font-size="15" font-weight="600" fill="currentColor">${escapeXml(title)}</text>`,
    );
  }
  let swatchX = 8;
  for (const { label, color } of swatches) {
    header.push(
      `<rect x="${swatchX}" y="${titleHeight + 5}" width="11" height="11" fill="${escapeXml(color)}"></rect>`,
      `<text x="${swatchX + 15}" y="${titleHeight + 15}" font-family="system-ui, sans-serif" font-size="12" fill="currentColor">${escapeXml(label)}</text>`,
    );
    swatchX += 15 + 8 + label.length * 7 + 14;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" font-family="system-ui, sans-serif" style="background:#ffffff;color:#1a1a1a">${header.join("")}${svg.outerHTML}</svg>`;
}

function categoricalSwatches(scale: Plot.Scale | undefined): { label: string; color: string }[] {
  if (!scale || typeof scale.apply !== "function") return [];
  const domain = Array.isArray(scale.domain) ? scale.domain : [];
  if (domain.length === 0 || domain.length > 12) return [];
  if (scale.type && scale.type !== "ordinal" && scale.type !== "categorical") return [];
  return domain.map((value) => ({
    label: String(value),
    color: String(scale.apply(value)),
  }));
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const PLOT_TOOL_GUIDE = `# render_plot — deep data visualization skill

You can produce publication-quality charts with the render_plot tool, backed by
Observable Plot (the grammar behind the Observable Plot gallery). You describe
the chart as a JSON spec; the tool renders it to a PNG in your workspace and
attaches it to the chat.

## How to use the tool

1. Get or shape the data: an array of row objects. Either pass it inline as
   "data", or write it to a .csv/.tsv/.json file in your home and pass
   "data_path". CSV/TSV columns are auto-typed (numbers and dates are parsed).
2. Choose the chart form for the question (see catalog below).
3. Call render_plot with {"spec": {...}, "data": [...]} or
   {"spec": {...}, "data_path": "sales.csv"}.
4. The tool attaches the PNG to the chat automatically (attach: false to skip)
   and returns the output path, for example charts/plot-1.png.
5. Iterate: adjust marks, scales, and facets until the chart answers the
   question. Prefer several small focused charts over one crowded chart.

## Spec format

{
  "title": "optional chart title",
  "width": 640, "height": 400,
  "grid": true,
  "x": {"label": "…", "type": "log|linear|utc|band|point", "domain": […]},
  "y": {…}, "color": {"scheme": "tableau10|blues|turbo|…", "type": "diverging"},
  "fx": {…}, "fy": {…},                    // facet scales
  "marks": [
    {"type": "dot", "options": {"x": "field", "y": "field", "stroke": "category", "tip": true}},
    {"type": "ruleY", "data": [0]}         // per-mark data for annotations
  ]
}

Channel values are column names ("x": "price"), constants ("fill": "#4269d0"),
or for faceting put "fx"/"fy" in a mark's options. Add "sort": {"x": "-y"} to
order categories by value. Transforms wrap a mark's options:

  {"type": "rectY", "transform": {"name": "binX", "outputs": {"y": "count"}},
   "options": {"x": "weight", "fill": "species"}}

## Chart catalog (from the Plot gallery)

- Bar chart: barY + {"x": category, "y": value}; horizontal: barX with y category.
- Grouped / stacked bars: add "fill": category (stacks automatically);
  grouped: use "fx": category with barY.
- Histogram: rectY + transform binX with outputs {"y": "count"}.
- 2D histogram / heatmap: rect + transform bin with outputs {"fill": "count"};
  categorical heatmap: cell + {"x", "y", "fill": value}.
- Hex density: dot with transform hexbin, outputs {"r": "count"} or {"fill": "count"}.
- Scatterplot: dot + {"x", "y"}; bubble: add "r": value; add
  linearRegressionY for a trend line.
- Line chart: lineY + {"x": time, "y": value}; multi-series: add "stroke": category.
- Moving average: lineY + transform windowY; the window settings go in the
  transform outputs, e.g. {"name": "windowY", "outputs": {"k": 7, "reduce": "mean"}}.
- Area / streamgraph: areaY + {"x", "y", "fill": category} (+ "offset": "wiggle"
  in the y scale for streamgraphs).
- Box plot: boxY + {"x": category, "y": value}.
- Distribution ticks / strip plot: tickX + {"x": value, "y": category}.
- Slope / bump styles: line + point marks combined.
- Normalized shares: barY with transform normalizeY, or y scale {"percent": true}.
- Small multiples: any mark + "fx"/"fy" in its options (one panel per category).
- Candlestick-style ranges: ruleX with {"x", "y1", "y2"}.
- Tree / hierarchy: tree mark with path data like ["a/b/c", …].
- Network / flows: arrow or link marks with {"x1","y1","x2","y2"}.
- Contours / density: density for 2D point density, contour for gridded values.
- Waffle chart: waffleY + {"y": value, "fill": category}.
- Annotations: text marks for labels, ruleX/ruleY with per-mark "data" for
  reference lines, frame for panel borders.
- Maps: projection option (e.g. "equal-earth") with geo-ready coordinates on
  dot/spike/vector marks; sphere and graticule marks for context.

## Design rules

- Always label: set x/y {"label": …} when column names are cryptic; add a title.
- "tip": true on the primary mark documents exact values in the SVG structure.
- Use color only when it encodes something; categorical legends render
  automatically for up to 12 categories.
- Continuous color scales render without a legend bar — encode the scale
  meaning in the title or caption text instead.
- Sort categorical axes by value ("sort": {"x": "-y"}) unless order is inherent.
- Prefer binning/aggregation transforms over plotting tens of thousands of raw
  points; raw dots beyond ~5k rows get slow and unreadable.

Call render_plot with {"help": true} anytime to reread this guide.
`;
