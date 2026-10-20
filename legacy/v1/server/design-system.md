# 设计系统 —  Pillxa

> 本文件是全站 UI 的**唯一事实来源（single source of truth）​**。
> 任何新页面 / 组件都必须使用这里定义的 token 和组件，禁止引入未定义的值。
> AI Agent：修改任何 UI 代码前，必须先完整读完本文件。

---

## 1. 设计原则

1. **清晰优先于装饰** —— 先让信息层级清楚，再谈美观。
2. **一致性（雅各布定律）​** —— 同类元素在全站表现一致，符合用户在其他网站养成的习惯。
3. **快速反馈（多尔蒂阈值）​** —— 操作响应尽量 < 400ms，做不到就用 loading / 进度反馈补偿。
4. **渐进式披露** —— 默认只展示必要信息，复杂内容按需展开。
5. **默认可访问（WCAG AA）​** —— 对比度、键盘操作、label 缺一不可。
6. **移动端优先** —— 先写移动端样式，再用断点适配大屏。

---

## 2. 技术栈

- 后端渲染：Flask + Jinja2
- 样式：Tailwind CSS（utility-first）
- 组件库：Flowbite（基于 Tailwind，支持 Flask）
- 交互：Alpine.js（轻量交互）；HTMX（异步局部刷新，可选）
- 图标：Heroicons / Lucide（二选一，全站统一）

构建命令见 `AGENT.md`。

---

## 3. 颜色 Token

在 `tailwind.config.js` 中定义如下（中性色直接复用 Tailwind 内置的 `slate-*`）：

```js
// tailwind.config.js
module.exports = {
  content: [
    "./templates/**/*.html",
    "./static/js/**/*.js",
    "./node_modules/flowbite/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb", // 主色：主按钮 / 关键强调
          700: "#1d4ed8", // hover
          800: "#1e40af", // active
          900: "#1e3a8a",
        },
        success: { 50: "#f0fdf4", 500: "#22c55e", 600: "#16a34a", 700: "#15803d" },
        warning: { 50: "#fffbeb", 500: "#f59e0b", 600: "#d97706", 700: "#b45309" },
        danger:  { 50: "#fef2f2", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c" },
        info:    { 50: "#eff6ff", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI",
               "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [require("flowbite/plugin")],
};
```

**用色规则**

- `primary-*`：主要操作按钮、链接、关键强调，全站只用这一个品牌色系。
- `slate-*`（中性）：正文文字、边框、背景、次要信息。
  - 正文：`text-slate-700`；标题：`text-slate-900`；说明文字：`text-slate-500`
  - 边框：`border-slate-200`；页面背景：`bg-slate-50`；卡片背景：`bg-white`
- `success / warning / danger / info`：**仅用于状态反馈**（成功提示、错误、警告），不可用于普通装饰。
- ❌ 禁止出现任何未在此定义的十六进制色值（如 `#ff6600`、`text-[#333]`）。

---

## 4. 字体与排版

字族统一用 `font-sans`（Inter，缺失时回退系统字体）。字号阶梯如下：

| 用途        | Tailwind 类                     | 字号 / 行高     | 字重            |
|-------------|---------------------------------|-----------------|-----------------|
| 大标题 Display | `text-4xl leading-tight`     | 36px / 1.1      | `font-bold`     |
| H1          | `text-3xl leading-tight`        | 30px / 1.2      | `font-bold`     |
| H2          | `text-2xl leading-snug`         | 24px / 1.3      | `font-semibold` |
| H3          | `text-xl leading-snug`          | 20px / 1.4      | `font-semibold` |
| H4          | `text-lg`                       | 18px            | `font-semibold` |
| 正文 Body   | `text-base leading-relaxed`     | 16px / 1.6      | `font-normal`   |
| 小字 Small  | `text-sm`                       | 14px            | `font-normal`   |
| 辅助 Caption| `text-xs`                       | 12px            | `font-normal`   |

规则：正文一律 16px 起步保证可读性；一个页面里标题层级不要跳级使用。

---

## 5. 间距与布局

间距遵循 **4px 基准刻度**（Tailwind 默认即如此），只使用以下档位，禁止魔法数字：

`1=4px · 2=8px · 3=12px · 4=16px · 6=24px · 8=32px · 12=48px · 16=64px`

- 组件内元素间距：`gap-2` / `gap-3`
- 卡片内边距：`p-6`
- 区块之间垂直间距：`space-y-6` 或 `space-y-8`
- 页面主容器：`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8`
- 表单字段之间：`space-y-4`

---

## 6. 圆角 / 阴影 / 边框

- 圆角：小元素 `rounded-lg`（8px），卡片 / 模态框 `rounded-xl`（12px），头像 / 标签 `rounded-full`
- 阴影：默认卡片 `shadow-sm`；悬浮 / 弹层 `shadow-lg`；不要滥用大阴影
- 边框：统一 `border border-slate-200`

---

## 7. 组件规范（含示例代码）

> 优先使用 Flowbite 现成组件；下列为统一后的标准写法，新建组件请直接复制。

### 7.1 按钮

```html
<!-- 主按钮 -->
<button class="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5
               text-sm font-medium text-white shadow-sm transition
               hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
               active:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50">
  确认提交
</button>

<!-- 次按钮 -->
<button class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5
               text-sm font-medium text-slate-700 transition
               hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
               disabled:opacity-50">
  取消
</button>

<!-- 文字 / Ghost 按钮 -->
<button class="rounded-lg px-3 py-2 text-sm font-medium text-primary-600 transition hover:bg-primary-50">
  了解更多
</button>

<!-- 危险操作按钮 -->
<button class="inline-flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2.5 text-sm font-medium text-white
               transition hover:bg-danger-700 focus:ring-2 focus:ring-danger-500 focus:ring-offset-2">
  删除
</button>

<!-- 加载态（提交时切换到此状态并 disabled） -->
<button disabled class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm
               font-medium text-white opacity-70 cursor-not-allowed">
  <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
  </svg>
  处理中…
</button>
```

### 7.2 表单字段（含正常 / 错误状态）

```html
<div class="space-y-1.5">
  <label for="email" class="block text-sm font-medium text-slate-700">邮箱</label>
  <input id="email" type="email" placeholder="you@example.com"
         class="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900
                placeholder:text-slate-400 transition
                focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20
                disabled:bg-slate-50">
  <p class="text-sm text-slate-500">我们不会公开你的邮箱。</p>
</div>

<!-- 错误态 -->
<div class="space-y-1.5">
  <label for="pwd" class="block text-sm font-medium text-slate-700">密码</label>
  <input id="pwd" type="password"
         class="block w-full rounded-lg border border-danger-500 px-3.5 py-2.5 text-sm text-slate-900
                focus:outline-none focus:ring-2 focus:ring-danger-500/20"
         aria-invalid="true" aria-describedby="pwd-error">
  <p id="pwd-error" class="text-sm text-danger-600">密码至少 8 位，请补足后重试。</p>
</div>
```

### 7.3 卡片

```html
<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
  <h3 class="text-lg font-semibold text-slate-900">卡片标题</h3>
  <p class="mt-2 text-sm text-slate-500">卡片描述内容。</p>
</div>
```

### 7.4 提示条 Alert（状态反馈）

```html
<div class="flex items-start gap-3 rounded-lg border border-success-500/30 bg-success-50 p-4 text-sm text-success-700">
  <span class="mt-0.5">✓</span>
  <p>保存成功，你的更改已生效。</p>
</div>
```

### 7.5 徽章 Badge

```html
<span class="inline-flex items-center rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700">已完成</span>
<span class="inline-flex items-center rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning-700">进行中</span>
```

### 7.6 表格

```html
<div class="overflow-hidden rounded-xl border border-slate-200">
  <table class="min-w-full divide-y divide-slate-200 text-sm">
    <thead class="bg-slate-50">
      <tr>
        <th class="px-4 py-3 text-left font-medium text-slate-500">名称</th>
        <th class="px-4 py-3 text-left font-medium text-slate-500">状态</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-200 bg-white">
      <tr class="transition hover:bg-slate-50">
        <td class="px-4 py-3 text-slate-900">示例</td>
        <td class="px-4 py-3">…</td>
      </tr>
    </tbody>
  </table>
</div>
```

### 7.7 模态框 / 下拉 / 标签页

统一使用 **Flowbite** 的现成组件（modal、dropdown、tabs、toast），不要手写。
参考：https://flowbite.com/docs/components/

---

## 8. 交互状态（强制）

每个可交互元素都必须定义以下状态，缺一不可：

- **default**：默认样式
- **hover**：`hover:` 鼠标悬停反馈
- **focus**：`focus:ring-2`（键盘可见焦点环，禁止 `outline-none` 后不补 ring）
- **active**：`active:` 按下反馈
- **disabled**：`disabled:opacity-50 disabled:cursor-not-allowed`
- **loading**：异步操作时显示 spinner 并禁用，防止重复提交

---

## 9. 表单与校验

- **实时校验**：失焦或输入时即时反馈，不要等到提交才报错。
- **错误文案**：说清楚"哪里错了 + 怎么改"，禁止抛技术错误码。
- **保留输入**：校验失败后保留用户已填内容，不要清空。
- **提交反馈**：点击后按钮进入 loading 态并禁用，结束后给成功/失败提示。

---

## 10. 加载 / 空 / 错误状态

- 每个列表 / 表格都要有**空状态**（图标 + 一句说明 + 一个引导操作）。
- 每个异步请求都要有**加载指示**（骨架屏或 spinner）。
- 请求失败要有**重试入口**，而非空白页面。

---

## 11. 可访问性检查清单

- [ ] 使用语义化标签（`<button>`/`<nav>`/`<main>` 等），而非堆 `<div>`
- [ ] 每个 input 都有关联的 `<label>`
- [ ] 图片有 `alt`，图标按钮有 `aria-label`
- [ ] 可用键盘 Tab 操作，焦点环可见
- [ ] 正文与背景对比度 ≥ 4.5:1
