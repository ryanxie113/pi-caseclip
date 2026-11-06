# CaseClip · Pi 失败案例收藏器

Agent 做错时，用一条命令记录错误和你的纠正。插件会提取当前分支最近一次用户请求、最终回答和相关工具调用，保存前可以预览和删除字段。

[English](README.md) · [案例样张](examples/case.md)

在终端交互版 Pi 中使用。已验证 Pi 1.5.0 和 Node.js 22.22.2。

从 GitHub 安装可运行 `pi install git:github.com/ryanxie113/pi-caseclip@v0.1.0`，然后重启 Pi 或执行 `/reload`。

下载并解压安装包后，运行 `pi install /解压路径/package`，然后重启 Pi 或执行 `/reload`。从源码安装时，先在项目目录运行 `npm ci` 和 `npm run build`，再执行 `pi install /项目绝对路径`。

```text
/case save 调用了已下线的 v1 接口。预期改用 v2 并核对查询结果。
/case list
/case export md
```

保存或导出前会打开 JSON 编辑器。可删去不想保留的字段。回车确认，Shift+Enter 换行，Esc 取消。案例按当前工作目录区分，本地保存，支持 Markdown 和 JSON 导出。插件无需模型调用。分享前请人工核对内容，规则脱敏可能漏掉敏感信息。

完整命令、存储配置与测试方法见[英文说明](README.md)。
