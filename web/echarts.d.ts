/* Minimal ambient types for the vendored ECharts global. ECharts stays inlined as its own <script>
   (it is NOT bundled into the TS), so the UI sees it as a global `echarts`. We type only the surface
   this dashboard uses — enough for type-safety without vendoring ECharts' full ~thousand-line .d.ts. */

declare global {
  namespace echarts {
    interface EChartsInstance {
      setOption(option: unknown, notMerge?: boolean): void;
      resize(): void;
      dispose(): void;
    }
    function init(el: HTMLElement, theme?: string | null, opts?: { renderer?: string }): EChartsInstance;
    function getInstanceByDom(el: HTMLElement): EChartsInstance | undefined;
  }
}

export {};
