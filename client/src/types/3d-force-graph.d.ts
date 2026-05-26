declare module "3d-force-graph" {
  type ForceGraph3DOptions = {
    controlType?: "trackball" | "orbit" | "fly";
  };

  export default class ForceGraph3D {
    constructor(element: HTMLElement, options?: ForceGraph3DOptions);
  }
}
