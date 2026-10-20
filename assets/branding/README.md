# Pillxa Dispenser 品牌素材

产品名称为 **Pillxa Dispenser**。主标志以已重绘的 PNG 为原稿，导出圆角白底应用图标。文字标志保留用户原稿字形，收紧 SVG 空白画布。

品牌名为 **Pillxa**，2026-10-19 按用户要求恢复。当前 Flutter 界面、加载页、应用标题及安装后的显示名称统一使用 Pillxa。素材路径、包名、内部类名及演示登录凭据沿用现有技术标识。当前客户端采用简约图标与文字字标；本目录中的原始素材保留为参考。

| 文件 | 用户原文件 | 用途 |
| --- | --- | --- |
| [pillxa-mark-rounded.png](pillxa-mark-rounded.png) | 已重绘 PNG 的圆角导出 | 当前主标志、Windows 图标、紧凑导航与网页图标 |
| [pillxa-mark.png](pillxa-mark.png) | 基于原标志 PNG 视觉参考重新绘制 | 保留的不透明原稿 |
| [pillxa-app-icon.svg](pillxa-app-icon.svg) | 内嵌已批准的 PNG 和圆角裁切 | 图标导出源；不是复用旧 SVG 字形 |
| [pillxa-wordmark.svg](pillxa-wordmark.svg) | 图片3.svg | 横排文字标志，收紧空白画布后用于主导航与登录页 |
| [pillxa-mark.svg](pillxa-mark.svg) | 图片2.svg | 仅保留用户原稿，应用不再使用 |

圆角主标志保留原稿的字形、颜色和比例。底板距画布边缘 2.5%，圆角半径为底板宽度的 20%；只有底板外部透明，底板及字形内部的白色始终不透明，深色背景下不透底。Windows ICO、各尺寸 PNG 与网页图标使用同一导出源。Windows 的 16、20、24、32、40、48 像素导出在两个 L 之间保留一列完全不透明的白色像素，避免原稿间隙缩小到不足一个像素后被抗锯齿粘合；64 像素及更大版本保持自然缩放。ICO 提供 16、20、24、32、40、48、64、96、128、256 像素条目，供不同显示缩放选取。文字标志只调整根画布：`viewBox="416 126 719 283"`，路径与颜色不变，界面按自然比例显示。应用标题、窗口名及安装名称使用 Pillxa Dispenser。

重新导出：运行 `node tooling/export-app-icons.mjs`（或 `pnpm icons:export`），一次生成圆角导出源、各尺寸图标、带小尺寸字间隔的 Windows ICO，以及本目录和 `apps/web/public/branding/` 的高分辨率 `pillxa-mark-rounded.png`。不要直接用通用图标命令覆盖 ICO，否则会丢失小尺寸适配。

## 原稿重绘提示词（历史记录）

使用内置 imagegen，参考图为原应用的 128×128 PNG；没有复用原方形 SVG。最终采用 1254×1254 PNG。

> Use case: identity-preserve brand logo redraw. Asset: square Windows application icon and main brand mark for Pillxa Dispenser. Redraw the supplied PNG reference from scratch as a pristine high-resolution 1024x1024 raster logo; do not reuse or trace the existing SVG file. Preserve its recognizable lowercase typography and arrangement: 'pill' on the top line and 'xa' on the bottom line, compact rounded geometric letterforms, dark charcoal gray #595A5A. Two lines form a balanced almost-square block, centered with about 10% safe margins. Reference is only the identity and composition guide. Correct all rough edges and render crisp, consistent line weights and smooth rounded shapes. Entire square canvas must be solid pure white, including the counters inside p and a and the spaces between letters. Absolutely no transparency anywhere, no checkerboard, no outline of the reference image boundary, no gradient, no shadow, no 3D, no decorative motifs, no extra words. It must look correct on both dark and light desktop backgrounds.
