import { deriveLightPalette, normalizeTheme } from "../theme-core/theme-schema.mjs";

const keys = [
  "background", "panel", "panelAlt", "accent", "accentAlt",
  "secondary", "highlight", "text", "muted", "line", "lineOpacity",
];
const palette = (values) => Object.fromEntries(keys.map((key, index) => [key, values[index]]));
const appearance = (style, options = {}) => ({
  background: { focusX: 58, focusY: 50, zoom: 100, overlay: 24, ...(options.background || {}) },
  surface: { opacity: 88, blur: 18, radius: 18, shadow: 34, ...(options.surface || {}) },
  decoration: { style, intensity: 42, ...(options.decoration || {}) },
  typography: options.typography || "system",
});

const sceneProfiles = {
  "skin-01": ["spark", "今天，温柔地推进什么？", ["柔光", "整理", "专注"], ["整理灵感", "润色表达", "检查细节", "完成收尾"], ["pen", "spark", "review", "ship"], ["保持从容", "留意细节"]],
  "skin-02": ["coin", "今天要创造什么价值？", ["目标", "价值", "交付"], ["盘点机会", "核算价值", "推进成交", "复盘收益"], ["research", "chart", "ship", "review"], ["目标清晰", "稳步进账"]],
  "skin-03": ["monitor", "下一条清晰路径是什么？", ["系统", "边界", "未来"], ["扫描系统", "设计接口", "验证路径", "发布版本"], ["monitor", "code", "review", "ship"], ["系统在线", "边界清晰"]],
  "skin-04": ["pen", "留白之后，答案是什么？", ["阅读", "梳理", "沉静"], ["阅读材料", "提炼要点", "组织思路", "写下结论"], ["research", "plan", "pen", "review"], ["思路清透", "保持留白"]],
  "skin-05": ["spark", "把哪个灵感做成原型？", ["灵感", "原型", "实验"], ["捕捉火花", "快速构建", "测试反馈", "迭代成形"], ["spark", "build", "research", "wand"], ["灵感活跃", "快速试验"]],
  "skin-06": ["moon", "今夜要深入哪一个问题？", ["沉浸", "深潜", "微光"], ["进入深潜", "追踪线索", "打磨方案", "记录发现"], ["moon", "research", "build", "pen"], ["专注稳定", "勿扰模式"]],
  "skin-07": ["signal", "让工作跟上今天的节拍", ["节奏", "协作", "舞台"], ["校准节拍", "编排任务", "同步协作", "完成演出"], ["signal", "plan", "wand", "ship"], ["节拍在线", "保持轻快"]],
  "skin-08": ["spark", "把最重要的工作放到聚光灯下", ["聚焦", "品质", "呈现"], ["选定焦点", "打磨质感", "审查呈现", "正式发布"], ["compass", "palette", "review", "ship"], ["舞台就绪", "聚焦主线"]],
  "skin-09": ["code", "今天要攻克哪段代码？", ["编码", "调试", "质量"], ["理解代码", "实现功能", "定位缺陷", "运行验证"], ["code", "build", "repair", "review"], ["深度工作", "测试优先"]],
  "skin-10": ["plan", "下一项产品决策是什么？", ["问题", "路径", "决策"], ["澄清问题", "梳理用户", "比较方案", "形成决策"], ["research", "plan", "chart", "review"], ["决策模式", "用户优先"]],
  "skin-11": ["palette", "怎样让这个设计更准确？", ["构图", "色彩", "细节"], ["建立构图", "调整色彩", "检查细节", "交付规范"], ["plan", "palette", "review", "ship"], ["创意场在线", "像素准确"]],
  "skin-12": ["chart", "数据正在说明什么？", ["指标", "信号", "洞察"], ["定义指标", "清洗数据", "识别信号", "表达洞察"], ["plan", "gear", "chart", "pen"], ["信号锁定", "关注异常"]],
  "skin-13": ["pen", "今天要讲好哪个故事？", ["素材", "叙事", "发布"], ["整理素材", "搭建结构", "润色叙事", "发布内容"], ["research", "plan", "pen", "ship"], ["故事流动", "保持真诚"]],
  "skin-14": ["ship", "怎样让项目继续向前？", ["依赖", "里程碑", "行动"], ["检查依赖", "更新计划", "解除阻塞", "推进交付"], ["research", "plan", "repair", "ship"], ["进度可控", "下一步明确"]],
  "skin-15": ["research", "证据支持怎样的结论？", ["文献", "证据", "论证"], ["检索文献", "核对证据", "组织论证", "审校成稿"], ["research", "review", "plan", "pen"], ["档案已开", "遵循证据"]],
  "skin-16": ["monitor", "系统现在需要关注什么？", ["监控", "响应", "稳定"], ["查看告警", "定位影响", "执行处置", "复盘改进"], ["monitor", "research", "repair", "review"], ["系统稳定", "持续观测"]],
  "skin-17": ["cloud", "沿云海探索下一重境界", ["云海", "修行", "探索"], ["观测灵脉", "推演功法", "突破关隘", "记录心得"], ["cloud", "research", "mountain", "pen"], ["灵脉平稳", "心境澄明"]],
  "skin-18": ["mountain", "山海之外还有什么线索？", ["异闻", "考据", "远行"], ["翻阅异志", "辨认图腾", "绘制路线", "收录见闻"], ["research", "compass", "mountain", "pen"], ["异闻待考", "地图展开"]],
  "skin-19": ["sword", "这一式该如何落笔？", ["江湖", "策略", "决断"], ["听风辨势", "拆解招式", "快速出手", "复盘心法"], ["research", "plan", "sword", "review"], ["气息平稳", "出手果断"]],
  "skin-20": ["gear", "让每个机关严丝合缝", ["机关", "结构", "精密"], ["拆解结构", "绘制机括", "装配部件", "校验运转"], ["research", "plan", "gear", "review"], ["机括就绪", "精度稳定"]],
  "skin-21": ["mecha", "机库今天要锻造什么？", ["机甲", "工程", "远征"], ["读取遥测", "设计模块", "装配机体", "远征测试"], ["monitor", "plan", "mecha", "ship"], ["机库在线", "动力充足"]],
  "skin-22": ["pet", "循着微光开始今天的旅程", ["伙伴", "自然", "冒险"], ["整理行囊", "寻找线索", "照顾伙伴", "记录旅程"], ["plan", "compass", "pet", "pen"], ["伙伴安心", "小径明亮"]],
  "skin-23": ["moon", "今夜的城市有什么异常？", ["霓虹", "巡查", "异能"], ["扫描街区", "追踪异常", "协同处置", "归档事件"], ["monitor", "research", "repair", "pen"], ["夜网在线", "保持警觉"]],
  "skin-24": ["flame", "守住最初的火，也照亮前路", ["神话", "火种", "传承"], ["辨认火纹", "重铸祭器", "守护火种", "续写神话"], ["research", "gear", "flame", "pen"], ["火种稳定", "仪式就绪"]],
};

function sceneFor(id, name, copy) {
  const [icon, title, tags, actionTitles, actionIcons, lines] = sceneProfiles[id];
  const tones = ["accent", "secondary", "accentAlt", "highlight"];
  return {
    kind: "official-scene",
    identity: { icon, shortName: name },
    hero: { eyebrow: copy.brandSubtitle, title, description: copy.tagline, tags },
    actions: actionTitles.map((actionTitle, index) => ({
      icon: actionIcons[index], title: actionTitle,
      detail: ["先理解上下文与边界。", "把方案转化为具体行动。", "检查风险、反馈与质量。", "形成清晰可复用的结果。"][index],
      badge: tags[index % tags.length], tone: tones[index],
    })),
    widget: { icon: "signal", title: "场景状态", lines, visible: true },
    composer: { icon: "wand", label: tags[0], hint: `在「${name}」场景中描述下一项工作…` },
    chrome: { iconColor: "background", iconSurface: "accent", badgeColor: "highlight", cardText: "text" },
  };
}

function theme(id, name, copy, dark, options = {}) {
  const light = { ...deriveLightPalette(dark), ...(options.light || {}) };
  return normalizeTheme({
    schemaVersion: 3,
    id,
    name,
    image: "background.png",
    shellMode: options.shellMode || "recommended",
    palettes: { dark, light },
    appearance: options.appearance || appearance("orbit"),
    ...copy,
    scene: sceneFor(id, name, copy),
    nativeAppearance: {
      variant: options.nativeVariant || "dark",
      accent: dark.accent,
      surface: dark.panel,
      ink: dark.text,
      contrast: 62,
      diffAdded: dark.accentAlt,
      diffRemoved: dark.highlight,
      skill: dark.secondary,
    },
  });
}

export const officialThemeSpecs = [
  theme("skin-01", "粉系定制", {
    brandSubtitle: "BLUSH GARDEN", tagline: "柔粉玫瑰与轻盈花瓣，让工作台保持温柔明亮。",
    projectPrefix: "花园项目 · ", projectLabel: "选择花园项目", statusText: "BLUSH GARDEN ONLINE", quote: "CREATE WITH GRACE",
  }, palette(["#2a171b", "#3a2228", "#4a2c34", "#e98b9c", "#f5b4bf", "#f2c7cf", "#c85f76", "#fff5f7", "#d7b6bd", "#e98b9c", 0.32]), {
    light: { background: "#fff5f7", panel: "#ffffff", panelAlt: "#fce7eb", text: "#321d22", muted: "#7a5c63" },
    appearance: appearance("sparkles", { background: { focusX: 64, overlay: 18 }, surface: { opacity: 84, blur: 20, radius: 22 }, typography: "rounded" }),
  }),
  theme("skin-02", "财神打工版", {
    brandSubtitle: "PROSPERITY MODE", tagline: "朱砂红与鎏金意象，为今天的项目添一点好彩头。",
    projectPrefix: "开运项目 · ", projectLabel: "选择开运项目", statusText: "PROSPERITY ONLINE", quote: "BUILD VALUE TODAY",
  }, palette(["#24130f", "#351b14", "#47251a", "#d43d2f", "#e5b64f", "#d7a838", "#9f251f", "#fff7e8", "#d5b994", "#e5b64f", 0.34]), {
    light: { background: "#fff7e8", panel: "#fffdf7", panelAlt: "#fbe9d3", text: "#39170f", muted: "#7c5b43" },
    appearance: appearance("grain", { background: { focusX: 60, overlay: 26 }, surface: { opacity: 90, blur: 14, radius: 14 }, typography: "editorial" }),
  }),
  theme("skin-03", "红白科幻", {
    brandSubtitle: "RED HORIZON", tagline: "克制的红白未来地平线，适合清晰、专注的工作节奏。",
    projectPrefix: "未来项目 · ", projectLabel: "选择未来项目", statusText: "HORIZON ONLINE", quote: "BUILD THE NEXT HORIZON",
  }, palette(["#211214", "#33191d", "#452126", "#ef4b50", "#ff8080", "#f2a2a4", "#be222c", "#fff7f7", "#d5b7b9", "#ef4b50", 0.34]), {
    light: { background: "#fff8f8", panel: "#ffffff", panelAlt: "#fcebed", text: "#2d1719", muted: "#72575a" },
    appearance: appearance("grid", { background: { focusX: 55, overlay: 16 }, surface: { opacity: 94, blur: 8, radius: 10 }, typography: "technical" }),
  }),
  theme("skin-04", "清透定制", {
    brandSubtitle: "QUIET PAPER", tagline: "象牙白、鼠尾草绿与纸鹤，留出安静的思考空间。",
    projectPrefix: "清透项目 · ", projectLabel: "选择清透项目", statusText: "QUIET PAPER ONLINE", quote: "MAKE SPACE TO THINK",
  }, palette(["#182018", "#222c21", "#2d392a", "#91a176", "#b1bd91", "#c7ceb0", "#6f8057", "#f7f8ef", "#bdc5ac", "#91a176", 0.34]), {
    light: { background: "#f5f6ee", panel: "#fffefa", panelAlt: "#e9ede1", text: "#252a20", muted: "#68705d" },
    appearance: appearance("none", { background: { focusX: 68, overlay: 10 }, surface: { opacity: 82, blur: 22, radius: 20 }, typography: "editorial" }),
  }),
  theme("skin-05", "灵感小宇宙", {
    brandSubtitle: "IDEA ENGINE", tagline: "青蓝、珊瑚与明黄碰撞，为快速原型补充能量。",
    projectPrefix: "灵感项目 · ", projectLabel: "选择灵感项目", statusText: "IDEA ENGINE ONLINE", quote: "TURN ENERGY INTO IDEAS",
  }, palette(["#102326", "#173236", "#214348", "#2dbdb7", "#f0c928", "#53a9df", "#ef7064", "#f4fffc", "#a7cbc6", "#2dbdb7", 0.34]), {
    light: { background: "#f1faf8", panel: "#ffffff", panelAlt: "#e2f3f0", text: "#173033", muted: "#567a77" },
    appearance: appearance("sparkles", { background: { focusX: 50, overlay: 14 }, surface: { opacity: 82, blur: 20, radius: 22 }, decoration: { intensity: 58 }, typography: "rounded" }),
  }),
  theme("skin-06", "紫夜限定", {
    brandSubtitle: "PRISM NIGHT", tagline: "蓝紫星夜、晶体蝴蝶与微光轨道，适合沉浸工作。",
    projectPrefix: "星夜项目 · ", projectLabel: "选择星夜项目", statusText: "PRISM NIGHT ONLINE", quote: "FOLLOW THE LIGHT",
  }, palette(["#090d38", "#12164b", "#1b225f", "#7b78ff", "#c16ef4", "#37c9ef", "#da55dc", "#f4f2ff", "#aaa9dc", "#7b78ff", 0.38]), {
    light: { background: "#f4f3ff", panel: "#ffffff", panelAlt: "#e9e7fb", text: "#25234d", muted: "#66658c" },
    appearance: appearance("orbit", { background: { focusX: 62, overlay: 34 }, surface: { opacity: 78, blur: 24, radius: 22 }, decoration: { intensity: 68 }, typography: "rounded" }),
  }),
  theme("skin-07", "初音未来", {
    brandSubtitle: "CYAN RHYTHM", tagline: "青粉电子音浪与全息舞台，保持轻快而明亮的节奏。",
    projectPrefix: "音浪项目 · ", projectLabel: "选择音浪项目", statusText: "CYAN RHYTHM ONLINE", quote: "CODE IN RHYTHM",
  }, palette(["#082733", "#0d3947", "#124c5c", "#2dd4d0", "#73e8df", "#f2a4dc", "#d668c0", "#efffff", "#a5d5d5", "#2dd4d0", 0.36]), {
    light: { background: "#effcfb", panel: "#ffffff", panelAlt: "#ddf4f2", text: "#16343a", muted: "#5b7f80" },
    appearance: appearance("sparkles", { background: { focusX: 62, overlay: 18 }, surface: { opacity: 80, blur: 22, radius: 24 }, decoration: { intensity: 64 }, typography: "rounded" }),
  }),
  theme("skin-08", "舞台黑金", {
    brandSubtitle: "GOLDEN STAGE", tagline: "哑光黑、香槟金与舞台光束，让视觉焦点更集中。",
    projectPrefix: "舞台项目 · ", projectLabel: "选择舞台项目", statusText: "GOLDEN STAGE ONLINE", quote: "OWN THE STAGE",
  }, palette(["#0c0b09", "#16130f", "#211c15", "#d6ad5c", "#f0cf86", "#b79458", "#8f6a2f", "#fff9ea", "#c5b89c", "#d6ad5c", 0.36]), {
    light: { background: "#f8f5ec", panel: "#fffdf7", panelAlt: "#eee8da", text: "#29241c", muted: "#716752" },
    appearance: appearance("grain", { background: { focusX: 52, overlay: 42 }, surface: { opacity: 92, blur: 10, radius: 12 }, typography: "editorial" }),
  }),
  theme("skin-09", "深度编码", {
    brandSubtitle: "DEEP WORK MODE", tagline: "为长时间编码保留清晰层次。", projectPrefix: "代码项目 · ", projectLabel: "选择代码项目", statusText: "FOCUS SESSION ONLINE", quote: "STAY WITH THE PROBLEM",
  }, palette(["#071313", "#0b2020", "#123030", "#38d996", "#82f4ba", "#31bfce", "#e0a94a", "#effff8", "#91bdb0", "#38d996", 0.3]), { appearance: appearance("grid", { background: { focusX: 50, overlay: 36 }, surface: { opacity: 90, blur: 14, radius: 12 }, typography: "technical" }) }),
  theme("skin-10", "产品策划", {
    brandSubtitle: "PRODUCT CLARITY", tagline: "从问题、路径到决策的结构化工作台。", projectPrefix: "产品项目 · ", projectLabel: "选择产品项目", statusText: "DECISION MODE ONLINE", quote: "MAKE THE NEXT DECISION CLEAR",
  }, palette(["#202329", "#2d3138", "#3c424c", "#4f73d8", "#ef6b55", "#5ca2b7", "#d99b37", "#f8f9fb", "#aeb5c0", "#6f88ca", 0.28]), { light: { background: "#f4f5f7", panel: "#ffffff", panelAlt: "#e8ebef", text: "#252931", muted: "#69717e" }, appearance: appearance("none", { background: { focusX: 52, overlay: 8 }, surface: { opacity: 94, blur: 8, radius: 10 }, typography: "system" }) }),
  theme("skin-11", "视觉设计", {
    brandSubtitle: "VISUAL STUDIO", tagline: "为构图、色彩与细节判断保持敏锐。", projectPrefix: "设计项目 · ", projectLabel: "选择设计项目", statusText: "CREATIVE FIELD ONLINE", quote: "MAKE THE IDEA VISIBLE",
  }, palette(["#171817", "#252725", "#343735", "#ec4d3d", "#2cc7c9", "#4fa46d", "#efc93f", "#fffdf7", "#b7bab4", "#ec4d3d", 0.3]), { light: { background: "#f7f6f1", panel: "#ffffff", panelAlt: "#ecebe6", text: "#20211f", muted: "#686b66" }, appearance: appearance("grain", { background: { focusX: 50, overlay: 10 }, surface: { opacity: 84, blur: 16, radius: 8 }, typography: "editorial" }) }),
  theme("skin-12", "数据洞察", {
    brandSubtitle: "SIGNAL ANALYSIS", tagline: "在噪声中寻找稳定信号。", projectPrefix: "分析项目 · ", projectLabel: "选择分析项目", statusText: "SIGNAL LOCKED", quote: "FIND THE SIGNAL",
  }, palette(["#071720", "#0c2530", "#123744", "#29c3ba", "#73e4d7", "#4b9be2", "#e45d5d", "#effcff", "#94bcc4", "#29c3ba", 0.34]), { appearance: appearance("grid", { background: { focusX: 50, overlay: 34 }, surface: { opacity: 88, blur: 18, radius: 10 }, decoration: { intensity: 58 }, typography: "technical" }) }),
  theme("skin-13", "内容创作", {
    brandSubtitle: "STORY FLOW", tagline: "让素材、节奏与叙事持续流动。", projectPrefix: "内容项目 · ", projectLabel: "选择内容项目", statusText: "STORY ROOM ONLINE", quote: "FOLLOW THE THREAD",
  }, palette(["#24151c", "#34202a", "#482b38", "#ef705f", "#efad3d", "#35bfc0", "#d84991", "#fff6f2", "#d2acb4", "#ef705f", 0.32]), { light: { background: "#fff4ef", panel: "#ffffff", panelAlt: "#f9e5df", text: "#382129", muted: "#7e5d66" }, appearance: appearance("sparkles", { background: { focusX: 50, overlay: 16 }, surface: { opacity: 82, blur: 20, radius: 20 }, typography: "editorial" }) }),
  theme("skin-14", "项目推进", {
    brandSubtitle: "DELIVERY RHYTHM", tagline: "把依赖、里程碑和行动排成节奏。", projectPrefix: "交付项目 · ", projectLabel: "选择交付项目", statusText: "DELIVERY TRACK ONLINE", quote: "KEEP THE WORK MOVING",
  }, palette(["#172027", "#223039", "#30434d", "#2fa9a0", "#ef8b35", "#568da8", "#e66d3f", "#f4fafb", "#a8bcc3", "#2fa9a0", 0.3]), { light: { background: "#f3f6f7", panel: "#ffffff", panelAlt: "#e7edef", text: "#263036", muted: "#69777c" }, appearance: appearance("orbit", { background: { focusX: 50, overlay: 10 }, surface: { opacity: 90, blur: 12, radius: 14 }, typography: "technical" }) }),
  theme("skin-15", "研究写作", {
    brandSubtitle: "SCHOLAR ARCHIVE", tagline: "为阅读、考据与长文组织保留沉静。", projectPrefix: "研究项目 · ", projectLabel: "选择研究项目", statusText: "ARCHIVE SESSION ONLINE", quote: "FOLLOW THE EVIDENCE",
  }, palette(["#18201b", "#242d27", "#343d36", "#879b75", "#c4a362", "#78949a", "#8d4e54", "#f7f4e9", "#bdb8a7", "#879b75", 0.28]), { light: { background: "#f2efe4", panel: "#fffdf5", panelAlt: "#e8e3d6", text: "#2b2d27", muted: "#706d61" }, appearance: appearance("grain", { background: { focusX: 50, overlay: 20 }, surface: { opacity: 88, blur: 16, radius: 8 }, typography: "editorial" }) }),
  theme("skin-16", "运维值守", {
    brandSubtitle: "RELIABILITY WATCH", tagline: "稳定、警觉的持续观测模式。", projectPrefix: "值守项目 · ", projectLabel: "选择值守项目", statusText: "SYSTEMS NOMINAL", quote: "STEADY IS FAST",
  }, palette(["#061116", "#0a1b22", "#102a34", "#23b9b6", "#56dfd5", "#318da9", "#e59b37", "#eaf9fb", "#8eafb8", "#23b9b6", 0.32]), { appearance: appearance("grid", { background: { focusX: 50, overlay: 42 }, surface: { opacity: 92, blur: 10, radius: 8 }, decoration: { intensity: 64 }, typography: "technical" }) }),
  theme("skin-17", "云上仙途", {
    brandSubtitle: "CLOUD ASCENT", tagline: "云海灵脉中的东方修行之旅。", projectPrefix: "云上项目 · ", projectLabel: "选择云上项目", statusText: "JADE CURRENT ONLINE", quote: "RISE ABOVE THE CLOUDS",
  }, palette(["#10272a", "#17383a", "#214a4a", "#69b99a", "#9bd8ba", "#73b8c2", "#d9b86c", "#f5fffb", "#a6c9bd", "#69b99a", 0.3]), { light: { background: "#f1f7f3", panel: "#ffffff", panelAlt: "#e2eee7", text: "#24332e", muted: "#657b73" }, appearance: appearance("orbit", { background: { focusX: 50, overlay: 12 }, surface: { opacity: 78, blur: 24, radius: 22 }, typography: "editorial" }) }),
  theme("skin-18", "山海异闻", {
    brandSubtitle: "MOUNTAIN SEA", tagline: "古代博物纹理与山海幻想。", projectPrefix: "异闻项目 · ", projectLabel: "选择异闻项目", statusText: "ANCIENT FIELD ONLINE", quote: "WONDER LIVES BEYOND THE MAP",
  }, palette(["#182221", "#24332f", "#354840", "#4e9b7a", "#77b99a", "#39899c", "#a96b43", "#f1f6ec", "#a6b9aa", "#4e9b7a", 0.32]), { appearance: appearance("grain", { background: { focusX: 50, overlay: 30 }, surface: { opacity: 84, blur: 18, radius: 16 }, typography: "editorial" }) }),
  theme("skin-19", "墨影江湖", {
    brandSubtitle: "INK HORIZON", tagline: "水墨留白与凌厉刀光。", projectPrefix: "江湖项目 · ", projectLabel: "选择江湖项目", statusText: "INK CURRENT ONLINE", quote: "MOVE BEFORE THE INK DRIES",
  }, palette(["#151719", "#222528", "#32363a", "#d1483f", "#ef766b", "#8f9ea3", "#be3b34", "#f7f5ef", "#aeb1ad", "#d1483f", 0.28]), { light: { background: "#f2f1ec", panel: "#ffffff", panelAlt: "#e7e6e0", text: "#282a2b", muted: "#707373" }, appearance: appearance("grain", { background: { focusX: 50, overlay: 14 }, surface: { opacity: 78, blur: 20, radius: 6 }, typography: "editorial" }) }),
  theme("skin-20", "长安机关", {
    brandSubtitle: "CHANG'AN MECHANICA", tagline: "盛唐幻想与精密机关。", projectPrefix: "机关项目 · ", projectLabel: "选择机关项目", statusText: "MECHANISM ONLINE", quote: "MAKE EVERY PART MATTER",
  }, palette(["#261510", "#382018", "#4b2d20", "#c83e2e", "#d9a94f", "#59798b", "#9d2f28", "#fff6df", "#cfb996", "#d9a94f", 0.34]), { light: { background: "#fbf2df", panel: "#fffdf5", panelAlt: "#f2e3ca", text: "#38231a", muted: "#7d664f" }, appearance: appearance("orbit", { background: { focusX: 46, overlay: 24 }, surface: { opacity: 88, blur: 14, radius: 12 }, typography: "editorial" }) }),
  theme("skin-21", "星穹机甲", {
    brandSubtitle: "ORBITAL FORGE", tagline: "东方科幻与重型机械结构。", projectPrefix: "星穹项目 · ", projectLabel: "选择星穹项目", statusText: "HANGAR SYSTEMS ONLINE", quote: "BUILD FOR THE DISTANCE",
  }, palette(["#0b1118", "#111c26", "#1b2b36", "#d84b45", "#f07a70", "#3ea5bd", "#b92f38", "#edf6fa", "#91a9b5", "#3ea5bd", 0.34]), { appearance: appearance("grid", { background: { focusX: 50, overlay: 38 }, surface: { opacity: 92, blur: 10, radius: 8 }, typography: "technical" }) }),
  theme("skin-22", "灵宠奇旅", {
    brandSubtitle: "SPIRIT TRAIL", tagline: "自然灵性与温暖轻冒险。", projectPrefix: "奇旅项目 · ", projectLabel: "选择奇旅项目", statusText: "TRAIL LIGHTS ONLINE", quote: "FOLLOW THE SMALL LIGHTS",
  }, palette(["#1b2a21", "#293c2e", "#3a503d", "#67b878", "#9ad99a", "#63a8c1", "#e88968", "#f7fff2", "#adc5ae", "#67b878", 0.3]), { light: { background: "#f2f8ec", panel: "#ffffff", panelAlt: "#e5f0df", text: "#29342b", muted: "#6b7c6c" }, appearance: appearance("sparkles", { background: { focusX: 50, overlay: 10 }, surface: { opacity: 76, blur: 24, radius: 24 }, decoration: { intensity: 62 }, typography: "rounded" }) }),
  theme("skin-23", "霓虹巡夜", {
    brandSubtitle: "NEON NIGHT WATCH", tagline: "东方都市异能与夜行霓虹。", projectPrefix: "巡夜项目 · ", projectLabel: "选择巡夜项目", statusText: "NIGHT GRID ONLINE", quote: "KEEP WATCH THROUGH THE RAIN",
  }, palette(["#090f19", "#111b28", "#1b2938", "#e33f48", "#f05bb4", "#37b8d0", "#6b4bd2", "#eefaff", "#91a9b8", "#37b8d0", 0.36]), { appearance: appearance("sparkles", { background: { focusX: 50, overlay: 38 }, surface: { opacity: 82, blur: 22, radius: 16 }, decoration: { intensity: 70 }, typography: "technical" }) }),
  theme("skin-24", "赤焰神话", {
    brandSubtitle: "SCARLET MYTH", tagline: "上古火纹与祭器质感。", projectPrefix: "神话项目 · ", projectLabel: "选择神话项目", statusText: "EMBER ALTAR ONLINE", quote: "CARRY THE FIRST FIRE",
  }, palette(["#1a0d09", "#2a1510", "#3d2117", "#df482f", "#f18a3c", "#b6783f", "#a72824", "#fff1df", "#c7a58f", "#df482f", 0.36]), { appearance: appearance("grain", { background: { focusX: 50, overlay: 42 }, surface: { opacity: 90, blur: 12, radius: 10 }, decoration: { intensity: 56 }, typography: "editorial" }) }),
];
