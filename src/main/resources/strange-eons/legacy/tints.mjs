// Component tinting support, adapted from Strange Eons' tints.js.
import { facade } from "../internal/host.mjs";
export const TintingFilter = facade("ca.cgjennings.graphics.filters.TintingFilter", {});
export const TintFilter = facade("ca.cgjennings.graphics.filters.TintFilter", {
    methods: [
        "clamp", "clampBoth", "fA", "fB", "fG", "fR", "getARGB", "iA", "iB", "iG", "iR",
        "setARGB"
    ],
    constructible: true
});
export const TintOverlayFilter = facade("ca.cgjennings.graphics.filters.TintOverlayFilter", {
    methods: [
        "clamp", "clampBoth", "fA", "fB", "fG", "fR", "getARGB", "iA", "iB", "iG", "iR",
        "setARGB"
    ],
    constructible: true
});
export const ReplaceFilter = facade("ca.cgjennings.graphics.filters.ReplaceHueSaturationFilter", {
    methods: [
        "clamp", "clampBoth", "fA", "fB", "fG", "fR", "getARGB", "iA", "iB", "iG", "iR",
        "setARGB"
    ],
    constructible: true
});
export const Tintable = facade("ca.cgjennings.apps.arkham.Tintable", {});
export const TintCache = facade("ca.cgjennings.graphics.filters.TintCache", {
    constructible: true
});
export const SetTintFilter = TintOverlayFilter;
