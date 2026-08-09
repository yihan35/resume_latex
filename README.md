# Resume LaTeX Editor

本项目是一个本地使用的 LaTeX 简历编辑器：左侧选择 `.tex` 文件，中间编辑源码，右侧预览编译后的 PDF，并支持从 PDF 定位回源码。

## 环境要求

- Node.js 18 或更高版本
- npm
- macOS 上建议安装 MacTeX，并确保 `xelatex` 可用。项目启动脚本会通过现有 npm 脚本把 `/Library/TeX/texbin` 加入服务端进程的 `PATH`

首次使用先安装依赖：

```sh
npm install
```

## 启动

在项目目录运行：

```sh
./scripts/start.sh
```

启动成功后打开：

```text
http://127.0.0.1:5173
```

脚本会在后台启动两个进程：

- API server: `http://127.0.0.1:43871`
- Vite client: `http://127.0.0.1:5173`

运行状态和日志保存在 `.resume-editor/`：

```text
.resume-editor/client.pid
.resume-editor/server.pid
.resume-editor/logs/client.log
.resume-editor/logs/server.log
```

## 关闭

在项目目录运行：

```sh
./scripts/stop.sh
```

脚本只会停止由 `./scripts/start.sh` 记录的进程，不会按端口强行杀掉其它程序。

## 常用命令

```sh
npm run start:editor   # 等同于 ./scripts/start.sh
npm run stop:editor    # 等同于 ./scripts/stop.sh
npm run editor         # 前台同时启动 server 和 client，适合调试
npm test               # 运行测试
npm run typecheck      # TypeScript 类型检查
npm run build          # 生产构建
```

## 可选配置

默认情况下，服务端会把当前项目的上一级目录作为简历项目根目录。也可以手动指定：

```sh
RESUME_PROJECT_ROOT=/path/to/resume ./scripts/start.sh
```

如需避开默认端口：

```sh
RESUME_EDITOR_PORT=44871 RESUME_EDITOR_CLIENT_PORT=5273 ./scripts/start.sh
```

关闭时如果使用了自定义状态目录，需要传入同一个值：

```sh
RESUME_EDITOR_STATE_DIR=/tmp/resume-editor ./scripts/stop.sh
```

## 排查

查看日志：

```sh
tail -f .resume-editor/logs/server.log
tail -f .resume-editor/logs/client.log
```

如果启动提示端口已被占用，先确认占用进程：

```sh
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:43871 -sTCP:LISTEN
```
