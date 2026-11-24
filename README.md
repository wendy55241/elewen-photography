# EleWen Photography — 网站源码

摄影作品集网站：五卷 35 mm 胶片，第一卷装着 24 张照片，另外四卷是空卷占位。首页写着 Welcome to EleWen Photography，进入时 11 被撕开（或切开）。同一套内容有两种呈现，页面里可以切换：

- 效果 1：五个暗盒在同一页公转，滚动换卷，横向拖动把中间那卷的胶片拉出来。
- 效果 2：一卷一页，底部页码换卷，滚动把这一页的胶片拉出来（地址后加 `?v=pages`）。

建议用 Chrome 157 及以上打开。首页用了 HTML-in-Canvas，其他浏览器会走简化的效果，页面照样能用。

## 放到 GitHub 上线

整个文件夹就是一个可以直接托管的静态网站，根目录的 `index.html` 就是网站本身，不需要安装或构建任何东西。

1. 新建一个仓库，把这个文件夹里的全部内容上传到仓库根目录（`index.html` 要在最外层）。
2. 仓库 Settings → Pages → Build and deployment：Source 选 Deploy from a branch，Branch 选 `main` 和 `/ (root)`，保存。
3. 等一两分钟，打开 `https://<用户名>.github.io/<仓库名>/`。

免费账户只能给公开仓库开 Pages，所以这样做源码是公开的。如果不想公开源码，只上传一个文件就行：把 `dist/elewen.html` 改名为 `index.html` 单独放进仓库，效果完全一样（图片和脚本都内嵌在这一个文件里，5.3 MB）。

## 本地预览

需要 Node.js 18 或更高版本，不需要 `npm install`。

- Windows：双击 `START.cmd`。
- 其他系统：在这个文件夹里运行 `node tools/serve.mjs`，然后打开 <http://127.0.0.1:4262/>。

直接双击 `index.html` 打不开三维部分（浏览器不允许从本地文件加载贴图）。想双击就看，用 `dist/elewen.html`。

## 改内容

| 想改什么 | 改哪里 |
| --- | --- |
| 首页和页面上的文字、邮箱 | `index.html` |
| 卷名、段名、每张照片的标题、顺序、哪几张画圈 | `tools/rolls.json`，改完重新生成（见下） |
| 颜色 | `src/style.css` 开头的变量；暗盒标签在 `src/labels.js` |
| 精选里用哪几张 | `index.html` 里的 `data-ref="段名:第几张"` |

**换照片或调整顺序**需要原图和 Python（带 Pillow：`pip install pillow`）。原图不在这个包里，包里只有处理好的图片。

1. 把所有原图放进一个文件夹，文件名要和 `tools/rolls.json` 里的 `file` 一致。
2. 编辑 `tools/rolls.json`。给空卷装片：把那一卷的 `"placeholder": true, "blank": 8` 换成和第一卷一样的 `"chapters": [...]`。
3. 运行 `python tools/prepare-photos.py "<原图文件夹>"`，它会重写 `assets/` 和 `src/rolls.js`。
4. 运行 `node tools/build-standalone.mjs`，重新生成 `dist/elewen.html`。

只改文字或颜色的话，跳过第 1–3 步，只在需要单文件时做第 4 步。

## 还是占位的内容

- 邮箱 `hello@example.com`（`index.html` 里两处）。
- 卷名（Roll One …）、段名（Overpaint、Runway、Velvet、Nocturne、Halide、Echo）、每张照片的标题、各段的说明文字、“关于”里的文字。
- 拍摄时间：`095A` 开头的照片按“相机时钟快 7 小时”换算过（`tools/rolls.json` 的 `tz_shift_hours`）；不对的话改成 0 再重新生成。

## 目录

```text
index.html                网站页面
src/main.js               三维场景和两种呈现
src/home.js               首页、鼠标跟随、进入转场
src/film.js, labels.js    胶片和暗盒标签
src/rolls.js              由脚本生成，不要手改
src/style.css             样式
src/lib/                  three.js r186（MIT，见 THREE-LICENSE.txt）
assets/frames/            放大用的照片和胶片贴图
assets/thumbs/            印样缩略图
assets/embed/             单文件用的小尺寸图
tools/rolls.json          卷、段、照片的清单
tools/prepare-photos.py   原图 -> assets/ 和 src/rolls.js
tools/build-standalone.mjs  -> dist/elewen.html
tools/serve.mjs           本地预览用的小服务器
tools/shoot.mjs 等        自动截图检查，可选；需要 playwright-core 和 Windows 上的 Chrome
dist/elewen.html          构建好的单文件
```

字体从 Google Fonts 在线加载，打不开时自动换成系统字体。照片版权归拍摄者所有。
