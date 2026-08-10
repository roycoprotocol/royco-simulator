// The Day simulator is the product, so it lives at the root. `/day-sim` stays
// live as the original address and renders the identical page, which also keeps
// it byte-stable for the template lock and verification contracts.
export { default, metadata } from "./day-sim/page";
