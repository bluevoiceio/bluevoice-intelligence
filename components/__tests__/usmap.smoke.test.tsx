// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render, waitFor } from "@testing-library/react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Smoke test: prove the react-simple-maps@3 + React 19 choropleth pipeline
 * actually renders geographies in a real (effect-running) DOM. We feed the
 * actual states-10m TopoJSON object (no network) and wait for one <path> per
 * state to appear.
 */
const topo = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../public/states-10m.json"), "utf8"),
);

afterEach(() => {
  cleanup();
});

describe("USMap rendering pipeline", () => {
  it("renders an SVG path for each state from the TopoJSON", async () => {
    const { container } = render(
      <ComposableMap projection="geoAlbersUsa">
        <Geographies geography={topo}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo} />
            ))
          }
        </Geographies>
      </ComposableMap>,
    );

    await waitFor(() => {
      // 50 states + DC + PR ≈ 50+; allow a generous lower bound.
      expect(container.querySelectorAll("path").length).toBeGreaterThan(45);
    });
  });
});
