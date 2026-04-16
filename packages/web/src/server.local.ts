#!/usr/bin/env bun
/**
 * 本地生产环境服务器
 * 剥离 Cloudflare 依赖，保留核心 API 功能
 */

import path from "path";
import { generate } from "models.dev";

const Providers = await generate(
  path.join(import.meta.dir, "..", "..", "..", "providers")
);

// 生成 model-schema.json 数据
function generateModelSchema(): object {
  const modelIds: string[] = [];
  for (const [providerId, provider] of Object.entries(Providers)) {
    for (const modelId of Object.keys(provider.models)) {
      modelIds.push(`${providerId}/${modelId}`);
    }
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://models.dev/model-schema.json",
    $defs: {
      Model: {
        type: "string",
        enum: modelIds.sort(),
        description: "AI model identifier in provider/model format",
      },
    },
  };
}

// 加载 provider logo
async function loadLogo(provider: string): Promise<Response> {
  const logoPath = path.join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "providers",
    provider,
    "logo.svg"
  );
  const defaultLogoPath = path.join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "providers",
    "logo.svg"
  );

  let file = Bun.file(logoPath);
  if (!(await file.exists())) {
    file = Bun.file(defaultLogoPath);
  }

  return new Response(file, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// 渲染首页 HTML
async function renderIndexHtml(): Promise<string> {
  const indexPath = path.join(import.meta.dir, "..", "index.html");
  const html = await Bun.file(indexPath).text();

  // 动态导入 render.tsx 中的 Rendered 变量
  const { Rendered } = await import("./render.js");
  return html.replace("<!--static-->", Rendered);
}

// 静态文件目录
const distDir = path.join(import.meta.dir, "..", "dist");

const server = Bun.serve({
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  hostname: process.env.HOST || "0.0.0.0",

  async fetch(req) {
    const url = new URL(req.url);

    // API 路由
    if (url.pathname === "/api.json") {
      return new Response(JSON.stringify(Providers, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    if (url.pathname === "/model-schema.json") {
      const schema = generateModelSchema();
      return new Response(JSON.stringify(schema, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Logo 路由
    if (url.pathname.startsWith("/logos/")) {
      const provider = url.pathname.split("/")[2]?.replace(".svg", "");
      if (provider) {
        return await loadLogo(provider);
      }
    }

    // 静态资源路由
    if (url.pathname.startsWith("/assets/")) {
      const filePath = path.join(distDir, url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // 首页路由
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await renderIndexHtml();
      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }

    // 尝试从 dist 目录提供静态文件
    const staticPath = path.join(distDir, url.pathname);
    const staticFile = Bun.file(staticPath);
    if (await staticFile.exists()) {
      return new Response(staticFile);
    }

    // 404 - 重定向到首页
    return new Response(null, {
      status: 302,
      headers: { Location: "/" },
    });
  },
});

console.log(`🚀 Local production server running at http://${server.hostname}:${server.port}`);
console.log(`📊 API endpoint: http://${server.hostname}:${server.port}/api.json`);
console.log(`📋 Model schema: http://${server.hostname}:${server.port}/model-schema.json`);
