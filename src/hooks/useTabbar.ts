import { ref } from "vue";
import { applyPageChrome } from "@/hooks/useTheme";

export interface TabbarItem {
  name: string;
  title: string;
  icon: string;
  pagePath: string;
}

export const tabbarItems: TabbarItem[] = [
  {
    name: "index",
    title: "首页",
    icon: "home",
    pagePath: "/pages/index/index",
  },
  {
    name: "mine",
    title: "我的",
    icon: "user",
    pagePath: "/pages/mine/index",
  },
];

function getActiveNameByRoute(): string {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  if (!current) return tabbarItems[0].name;

  const route = `/${current.route}`;
  return tabbarItems.find((item) => item.pagePath === route)?.name ?? tabbarItems[0].name;
}

// ponytail: 模块级状态，避免每个页面各自维护 active 导致切换不同步
const selected = ref(getActiveNameByRoute());

export function useTabbar() {
  function syncActive() {
    selected.value = getActiveNameByRoute();
  }

  function handleChange({ value }: { value: string | number }) {
    const item = tabbarItems.find((tab) => tab.name === value);
    if (!item || getActiveNameByRoute() === item.name) return;

    applyPageChrome();
    uni.switchTab({ url: item.pagePath });
  }

  return {
    tabbarItems,
    selected,
    syncActive,
    handleChange,
  };
}
