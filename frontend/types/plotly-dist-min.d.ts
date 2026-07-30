// plotly.js-dist-min ships no types; it is the same API surface as
// plotly.js, minified. Alias its types.
declare module "plotly.js-dist-min" {
  import type Plotly from "plotly.js";

  export default Plotly;
  export * from "plotly.js";
}
