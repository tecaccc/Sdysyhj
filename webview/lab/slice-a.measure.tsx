// 度量专用入口（D7① 逐切片体积核算）：同一 App 外壳仅挂路线 A 切片。
// 临时构建到 /tmp（lab-metrics.mjs），不入 media/ 产物。

import "./zod-jitless";
import "./lab.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { SliceA } from "./sliceA";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <SliceA />
    </React.StrictMode>
  );
}
