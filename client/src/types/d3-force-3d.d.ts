declare module "d3-force-3d" {
  type NumericAccessor<NodeDatum> = number | ((node: NodeDatum) => number);

  type ForceWithStrength<NodeDatum> = {
    strength(value: NumericAccessor<NodeDatum>): ForceWithStrength<NodeDatum>;
  };

  type CollideForce<NodeDatum> = Omit<ForceWithStrength<NodeDatum>, "strength"> & {
    strength(value: NumericAccessor<NodeDatum>): CollideForce<NodeDatum>;
    iterations(value: number): CollideForce<NodeDatum>;
  };

  export function forceCollide<NodeDatum>(
    radius?: NumericAccessor<NodeDatum>,
  ): CollideForce<NodeDatum>;

  export function forceX<NodeDatum>(
    x?: NumericAccessor<NodeDatum>,
  ): ForceWithStrength<NodeDatum>;

  export function forceY<NodeDatum>(
    y?: NumericAccessor<NodeDatum>,
  ): ForceWithStrength<NodeDatum>;

  export function forceZ<NodeDatum>(
    z?: NumericAccessor<NodeDatum>,
  ): ForceWithStrength<NodeDatum>;
}
