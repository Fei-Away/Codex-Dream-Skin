import { officialThemeSpecs } from "../themes/theme-specs.mjs";

const tags = [
  "亮色 / 粉系", "亮色 / 节日", "亮色 / 高对比", "亮色 / 清透",
  "亮色 / 活力", "深色 / 紫夜", "亮色 / 青粉", "深色 / 黑金",
  "岗位 / 开发", "岗位 / 产品", "岗位 / 设计", "岗位 / 数据",
  "岗位 / 内容", "岗位 / 项目", "岗位 / 研究", "岗位 / 运维",
  "原创 / 修仙", "原创 / 山海", "原创 / 武侠", "原创 / 机关",
  "原创 / 机甲", "原创 / 奇旅", "原创 / 都市", "原创 / 神话",
];

function definition(theme, index) {
  const category = index < 8 ? "existing" : index < 16 ? "role" : "original-cn-fantasy";
  return {
    id: theme.id,
    name: theme.name,
    tagline: theme.tagline,
    tag: tags[index],
    category,
    source: "official",
    builtIn: true,
    previewOnly: false,
    imageUrl: `/api/themes/${theme.id}/image`,
    referenceImageUrl: category === "existing" ? `/assets/gallery/${theme.id}.jpg` : "",
  };
}

export const officialThemeDefinitions = officialThemeSpecs.map(definition);

export const officialThemeIds = new Set(officialThemeDefinitions.map((theme) => theme.id));
