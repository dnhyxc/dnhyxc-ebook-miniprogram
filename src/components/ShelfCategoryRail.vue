<template>
  <scroll-view scroll-x class="rail" :show-scrollbar="false" enable-flex>
    <view class="rail-inner">
      <view
        v-for="chip in chips"
        :key="chip.id"
        class="chip"
        :class="{ active: chip.active }"
        @click="emit('select', chip.key)"
      >
        <text class="chip-label">{{ chip.label }}</text>
        <text class="chip-count">{{ chip.count }}</text>
      </view>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { EbookCategory, ShelfCategoryKey } from "@/types/ebook";

const props = defineProps<{
  activeKey: ShelfCategoryKey;
  categories: EbookCategory[];
  uncategorizedCount: number;
  publicBookTotal: number;
  allCount: number;
}>();

const emit = defineEmits<{
  select: [key: ShelfCategoryKey];
}>();

function isActive(active: ShelfCategoryKey, key: ShelfCategoryKey): boolean {
  if (active.kind !== key.kind) return false;
  if (active.kind === "category" && key.kind === "category") {
    return active.categoryId === key.categoryId;
  }
  return true;
}

function keyId(key: ShelfCategoryKey): string {
  if (key.kind === "category") return `category:${key.categoryId}`;
  return key.kind;
}

const chips = computed(() => {
  const activeKey = props.activeKey;
  const list: Array<{
    id: string;
    key: ShelfCategoryKey;
    label: string;
    count: number;
    active: boolean;
  }> = [
    {
      id: "all",
      key: { kind: "all" },
      label: "全部",
      count: props.allCount,
      active: isActive(activeKey, { kind: "all" }),
    },
    ...props.categories
      .filter((c) => c.bookCount > 0)
      .map((c) => {
        const key: ShelfCategoryKey = { kind: "category", categoryId: c.id };
        return {
          id: keyId(key),
          key,
          label: c.name,
          count: c.bookCount,
          active: isActive(activeKey, key),
        };
      }),
  ];

  if (props.publicBookTotal > 0) {
    const key: ShelfCategoryKey = { kind: "public" };
    list.push({
      id: "public",
      key,
      label: "公开",
      count: props.publicBookTotal,
      active: isActive(activeKey, key),
    });
  }

  if (props.uncategorizedCount > 0) {
    const key: ShelfCategoryKey = { kind: "uncategorized" };
    list.push({
      id: "uncategorized",
      key,
      label: "未分类",
      count: props.uncategorizedCount,
      active: isActive(activeKey, key),
    });
  }

  return list;
});
</script>

<style scoped>
.rail {
  width: 100%;
  white-space: nowrap;
}

.rail-inner {
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 32rpx 8rpx;
  box-sizing: border-box;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  flex-shrink: 0;
  border: 1px solid var(--wot-border-light);
  background: transparent;
}

.chip.active {
  background: var(--wot-filled-oppo);
  border-color: var(--wot-border-main);
}

.chip-label {
  max-width: 220rpx;
  font-size: 26rpx;
  color: var(--wot-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip.active .chip-label {
  color: var(--wot-text-main);
  font-weight: 600;
}

.chip-count {
  min-width: 36rpx;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  line-height: 1.4;
  text-align: center;
  color: var(--wot-text-auxiliary);
  background: var(--wot-divider-light);
}

.chip.active .chip-count {
  color: var(--wot-text-main);
  background: var(--wot-filled-content);
  font-weight: 600;
}
</style>
