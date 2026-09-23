// Sharp 0.35 ships these declarations but omits them from its export map.
// Preserve its actual types until the upstream export map includes `types`.
declare module "sharp" {
  const sharp: typeof import("../node_modules/sharp/lib/index");
  export = sharp;
}
