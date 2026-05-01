将 Live2D 模型按下面结构放置：

- `public/live2d/girlfriend/model3.json`
- `public/live2d/girlfriend/textures/`
- `public/live2d/girlfriend/motions/`
- `public/live2d/girlfriend/expressions/`
- `public/live2d/boyfriend/model3.json`
- `public/live2d/boyfriend/textures/`
- `public/live2d/boyfriend/motions/`
- `public/live2d/boyfriend/expressions/`

前端会根据 `companionType` 自动加载：

- `girlfriend -> /live2d/girlfriend/model3.json`
- `boyfriend -> /live2d/boyfriend/model3.json`

如果模型文件暂未放入，界面会自动显示原创占位卡片，不影响聊天功能。
