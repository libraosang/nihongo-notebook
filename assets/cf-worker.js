/**
 * Nihongo Notebook · Anthropic API CORS 代理
 * 部署到 Cloudflare Workers（免费套餐）
 *
 * 部署步骤：
 * 1. 打开 https://workers.cloudflare.com → 登录或注册（免费）
 * 2. 创建新 Worker → 把本文件全部内容粘贴进去
 * 3. 点击 Deploy → 复制 Worker 域名（如 https://xxx.workers.dev）
 * 4. 在笔记本 App 的「Anthropic API Key」设置里填入该域名
 */

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';

    // 只允许来自 GitHub Pages 和本地开发的请求
    const allowed =
      origin.includes('libraosang.github.io') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1');

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
      'Access-Control-Max-Age': '86400',
    };

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 转发到 Anthropic API
    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         request.headers.get('x-api-key') || '',
          'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
          'content-type':      'application/json',
        },
        body: request.body,
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: 'Proxy fetch error: ' + e.message } }), {
        status: 502,
        headers: { 'content-type': 'application/json', ...corsHeaders },
      });
    }

    const body = await anthropicRes.text();
    return new Response(body, {
      status: anthropicRes.status,
      headers: { 'content-type': 'application/json', ...corsHeaders },
    });
  },
};
