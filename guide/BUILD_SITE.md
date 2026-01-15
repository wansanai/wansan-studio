# Wansan 手册网站生成指南

我们推荐使用 [Starlight](https://starlight.astro.build/) 来发布这些 Markdown 文档。它会为您提供开箱即用的全文搜索、多语言支持和极佳的阅读体验。

## 🚀 快速开始

### 1. 初始化网站项目
在项目根目录下创建一个 `website` 文件夹并初始化 Starlight：
```bash
npx create-astro@latest website -- --template starlight
```

### 2. 同步内容
将 `guide` 目录下的 Markdown 文件拷贝到网站的文档中心：
```bash
# macOS/Linux
cp -r guide/* website/src/content/docs/
```

### 3. 本地预览
```bash
cd website
npm install
npm run dev
```
打开浏览器访问 `http://localhost:4321` 即可看到效果。

## 🖼 静态资源 (图片与 GIF)

手册支持所有标准图片格式，包括 **.jpg, .png, .svg** 以及 **.gif**。

- **存放位置**：请将所有资源放在 `guide/assets/` 目录下。
- **动图建议**：对于交互复杂的流程（如拖拽排序、AI 纠错），强烈建议使用 GIF 进行演示。
- **引用方式**：在 Markdown 中使用相对路径引用，例如 `![描述](../assets/demo.gif)`。

## 🛠 配置建议

为了匹配 Wansan 的设计风格，建议修改 `website/astro.config.mjs`：

- **侧边栏配置**：使用 `autogenerate` 自动根据文件夹生成目录。
- **自定义 CSS**：在 `src/styles/custom.css` 中增加大圆角和柔和阴影，以契合 "Wansan Airy" 风格。

## 📦 发布上线

您可以直接将 `website/dist` 目录下的内容上传到任何静态托管服务（如 Vercel, Netlify 或 GitHub Pages）。

### GitHub Pages 一键部署
如果您使用 GitHub 托管代码，可以添加以下 Action 脚本 `.github/workflows/deploy-docs.yml`：
1. 监听 `guide` 目录的变化。
2. 自动运行 `npm run build`。
3. 将结果推送到 `gh-pages` 分支。
