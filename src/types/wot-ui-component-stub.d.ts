import type { DefineComponent } from "vue";

// ponytail: loose stub so vue-tsc does not type-check @wot-ui .vue sources in node_modules
type WotUiComponent = DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;

declare const component: WotUiComponent;
export default component;
