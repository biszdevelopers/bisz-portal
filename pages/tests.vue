<script setup lang="ts">
import { RefreshRight, VideoPlay } from "@element-plus/icons-vue";

type VideoQuality = "180p" | "360p" | "720p" | "1080p";

type AssetOption = {
  quality: VideoQuality;
  url: string;
};

type AssetMetrics = {
  status: number;
  statusText: string;
  totalBytes: number;
  timeToHeadersMs: number;
  downloadTimeMs: number;
  totalTimeMs: number;
  averageMbps: number;
  averageMiBs: number;
  contentType: string;
  contentLength: string;
  cacheStatus: string;
  cacheControl: string;
  age: string;
  etag: string;
  lastModified: string;
  server: string;
  protocol: string;
  transferSize: number | null;
  encodedBodySize: number | null;
  headerProbeMs: number | null;
};

type HeaderProbe = {
  status: number;
  durationMs: number;
  headers: Record<string, string>;
};

type AlertType = "success" | "warning" | "info" | "error";

const assetOptions: AssetOption[] = [
  {
    quality: "180p",
    url: "https://assets.bisz.dev/a6426b84c6fa1b1874709695ff2fd8fdd320cfc9a8bb7ee1bdb19dd0906a6c72",
  },
  {
    quality: "360p",
    url: "https://assets.bisz.dev/992ae190669a6ec3c1898480604638f825444156960e3afdc99a53093fbb1653",
  },
  {
    quality: "720p",
    url: "https://assets.bisz.dev/23595e64e13368a375ea801c6fdd1acc3b6dd8cf8014a9e3b4a10c2587b2cec2",
  },
  {
    quality: "1080p",
    url: "https://assets.bisz.dev/04943c9afecfa3c8c87729c9a5bbda6456b2011013d1fccb37d696893c434289",
  },
];

const activeTab = ref("assets");
const selectedQuality = ref<VideoQuality>("180p");
const loading = ref(false);
const errorMessage = ref("");
const bytesLoaded = ref(0);
const expectedBytes = ref<number | null>(null);
const liveMbps = ref(0);
const videoUrl = ref("");
const metrics = ref<AssetMetrics | null>(null);
const responseHeaders = ref<Array<{ source: string; name: string; value: string }>>([]);
let activeRequest: AbortController | null = null;

const selectedAsset = computed(() =>
  assetOptions.find((asset) => asset.quality === selectedQuality.value) ?? assetOptions[0]!,
);

const downloadPercentage = computed(() => {
  if (!expectedBytes.value) return 0;
  return Math.min(100, Math.round((bytesLoaded.value / expectedBytes.value) * 100));
});

const edgeCacheResult = computed<{ type: AlertType; title: string; description: string }>(() => {
  const status = metrics.value?.cacheStatus.toUpperCase() ?? "NOT EXPOSED";
  switch (status) {
    case "HIT":
      return { type: "success", title: "Cloudflare edge cache: HIT", description: "The probe was served from Cloudflare's edge cache." };
    case "REVALIDATED":
      return { type: "success", title: "Cloudflare edge cache: REVALIDATED", description: "Cloudflare had a cached copy and confirmed it was still current with the origin." };
    case "UPDATING":
    case "STALE":
      return { type: "success", title: `Cloudflare edge cache: ${status}`, description: "Cloudflare served a cached copy while refreshing or tolerating an origin issue." };
    case "MISS":
      return { type: "warning", title: "Cloudflare edge cache: MISS", description: "The object was not present at this edge and Cloudflare fetched it from the origin." };
    case "EXPIRED":
      return { type: "warning", title: "Cloudflare edge cache: EXPIRED", description: "The cached object had expired, so Cloudflare fetched a fresh response from the origin." };
    case "BYPASS":
      return { type: "warning", title: "Cloudflare edge cache: BYPASS", description: "The request was cache-eligible, but the response or cache configuration prevented storage." };
    case "DYNAMIC":
      return { type: "info", title: "Cloudflare edge cache: DYNAMIC", description: "Cloudflare considered this asset ineligible for edge caching and sent the request to the origin." };
    default:
      return { type: "info", title: `Cloudflare edge cache: ${status}`, description: "Cloudflare did not return a recognized cache decision for this probe." };
  }
});

function formatBytes(bytes: number | null) {
  if (bytes == null) return "Not exposed";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function headerValue(headers: Headers, ...names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value;
  }
  return "Not exposed";
}

function clearVideoUrl() {
  if (!videoUrl.value) return;
  URL.revokeObjectURL(videoUrl.value);
  videoUrl.value = "";
}

async function runAssetTest() {
  activeRequest?.abort();
  const requestController = new AbortController();
  activeRequest = requestController;
  clearVideoUrl();
  loading.value = true;
  errorMessage.value = "";
  bytesLoaded.value = 0;
  expectedBytes.value = null;
  liveMbps.value = 0;
  metrics.value = null;
  responseHeaders.value = [];

  const requestUrl = selectedAsset.value.url;
  const testRunId = crypto.randomUUID();
  const startedAt = performance.now();

  try {
    const response = await fetch(requestUrl, {
      cache: "no-store",
      headers: { Accept: "video/*" },
      signal: requestController.signal,
    });
    const headersReceivedAt = performance.now();
    responseHeaders.value = Array.from(response.headers.entries()).map(([name, value]) => ({
      source: "Browser GET",
      name,
      value,
    }));
    expectedBytes.value = Number(response.headers.get("content-length")) || null;

    if (!response.ok) throw new Error(`Assets server returned ${response.status} ${response.statusText}`);
    if (!response.body) throw new Error("This browser did not provide a readable response body.");

    const reader = response.body.getReader();
    const chunks: BlobPart[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk);
      bytesLoaded.value += value.byteLength;
      const elapsedSeconds = (performance.now() - headersReceivedAt) / 1000;
      liveMbps.value = elapsedSeconds > 0 ? (bytesLoaded.value * 8) / elapsedSeconds / 1_000_000 : 0;
    }

    const finishedAt = performance.now();
    const downloadTimeMs = finishedAt - headersReceivedAt;
    const resourceEntry = performance
      .getEntriesByName(requestUrl, "resource")
      .at(-1) as PerformanceResourceTiming | undefined;
    const headerProbe = await $fetch<HeaderProbe>("/api/tests/assets/headers", {
      query: { quality: selectedQuality.value, testRun: testRunId },
      signal: requestController.signal,
    }).catch(() => null);
    if (headerProbe) {
      responseHeaders.value.push(...Object.entries(headerProbe.headers).map(([name, value]) => ({
        source: "Server cache probe",
        name,
        value,
      })));
    }
    const probeHeader = (...names: string[]) => {
      for (const name of names) {
        const value = headerProbe?.headers[name];
        if (value) return value;
      }
      return headerValue(response.headers, ...names);
    };
    const cacheStatus = headerValue(response.headers, "cf-cache-status", "x-cache", "x-cache-status") !== "Not exposed"
      ? headerValue(response.headers, "cf-cache-status", "x-cache", "x-cache-status")
      : probeHeader("cf-cache-status", "x-cache", "x-cache-status");

    videoUrl.value = URL.createObjectURL(new Blob(chunks, {
      type: response.headers.get("content-type") || "video/mp4",
    }));
    metrics.value = {
      status: response.status,
      statusText: response.statusText,
      totalBytes: bytesLoaded.value,
      timeToHeadersMs: headersReceivedAt - startedAt,
      downloadTimeMs,
      totalTimeMs: finishedAt - startedAt,
      averageMbps: downloadTimeMs > 0 ? (bytesLoaded.value * 8) / downloadTimeMs / 1000 : 0,
      averageMiBs: downloadTimeMs > 0 ? (bytesLoaded.value / 1024 / 1024) / (downloadTimeMs / 1000) : 0,
      contentType: headerValue(response.headers, "content-type"),
      contentLength: headerValue(response.headers, "content-length"),
      cacheStatus,
      cacheControl: probeHeader("cache-control"),
      age: probeHeader("age"),
      etag: probeHeader("etag"),
      lastModified: probeHeader("last-modified"),
      server: probeHeader("server", "via"),
      protocol: resourceEntry?.nextHopProtocol || "Not exposed",
      transferSize: resourceEntry?.transferSize || null,
      encodedBodySize: resourceEntry?.encodedBodySize || null,
      headerProbeMs: headerProbe?.durationMs ?? null,
    };
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return;
    errorMessage.value = caught instanceof Error ? caught.message : "The asset test failed.";
  } finally {
    if (activeRequest === requestController) loading.value = false;
  }
}

onMounted(() => { void runAssetTest(); });
onBeforeUnmount(() => {
  activeRequest?.abort();
  clearVideoUrl();
});
</script>

<template>
  <section class="test-suite-page">
    <header class="page-header">
      <h1>Test suite</h1>
      <p>Interactive diagnostics for Basis services.</p>
    </header>

    <el-tabs v-model="activeTab" type="border-card" class="test-suite-tabs">
      <el-tab-pane label="Assets" name="assets">
        <div class="asset-test-toolbar">
          <div>
            <h2>Video delivery test</h2>
            <p>Select a rendition to download it without using the browser cache and inspect the result.</p>
          </div>
          <div class="asset-test-actions">
            <el-select v-model="selectedQuality" aria-label="Video quality" @change="runAssetTest">
              <el-option v-for="asset in assetOptions" :key="asset.quality"
                :label="asset.quality" :value="asset.quality" />
            </el-select>
            <el-button type="primary" :icon="RefreshRight" :loading="loading" @click="runAssetTest">
              Run again
            </el-button>
          </div>
        </div>

        <el-alert title="Browser cache bypassed" type="info" :closable="false" show-icon>
          Every video run uses Fetch cache mode “no-store”. The stable asset URL keeps Cloudflare edge caching
          testable; CDN-only headers are collected by a separate uncached server probe because browsers hide them under CORS.
        </el-alert>

        <div class="video-panel">
          <div v-if="loading" class="download-state">
            <el-icon class="is-loading" :size="36"><VideoPlay /></el-icon>
            <strong>Downloading {{ selectedQuality }} video</strong>
            <el-progress v-if="expectedBytes" :percentage="downloadPercentage" :stroke-width="12" />
            <el-progress v-else :percentage="50" :indeterminate="true" :duration="1.2" :show-text="false" />
            <span>{{ formatBytes(bytesLoaded) }} downloaded · {{ liveMbps.toFixed(2) }} Mbps</span>
          </div>
          <el-alert v-else-if="errorMessage" title="Asset test failed" :description="errorMessage"
            type="error" :closable="false" show-icon />
          <video v-else-if="videoUrl" :key="videoUrl" class="test-video" :src="videoUrl" controls playsinline />
        </div>

        <template v-if="metrics">
          <el-alert class="edge-cache-result" :title="edgeCacheResult.title" :description="edgeCacheResult.description"
            :type="edgeCacheResult.type" :closable="false" show-icon />
          <div class="metrics-grid">
            <el-card shadow="never"><el-statistic title="Average download" :value="metrics.averageMbps" :precision="2" suffix=" Mbps" /></el-card>
            <el-card shadow="never"><el-statistic title="Throughput" :value="metrics.averageMiBs" :precision="2" suffix=" MiB/s" /></el-card>
            <el-card shadow="never"><el-statistic title="Time to headers" :value="metrics.timeToHeadersMs" :precision="0" suffix=" ms" /></el-card>
            <el-card shadow="never"><el-statistic title="Total request time" :value="metrics.totalTimeMs" :precision="0" suffix=" ms" /></el-card>
            <el-card shadow="never"><el-statistic title="Downloaded size" :value="metrics.totalBytes / 1024 / 1024" :precision="2" suffix=" MiB" /></el-card>
            <el-card shadow="never"><el-statistic title="HTTP status" :value="metrics.status" /></el-card>
          </div>

          <el-descriptions title="Delivery details" :column="2" border class="delivery-details">
            <el-descriptions-item label="Quality">{{ selectedQuality }}</el-descriptions-item>
            <el-descriptions-item label="Cache status">{{ metrics.cacheStatus }}</el-descriptions-item>
            <el-descriptions-item label="Cache-Control">{{ metrics.cacheControl }}</el-descriptions-item>
            <el-descriptions-item label="Age">{{ metrics.age }}</el-descriptions-item>
            <el-descriptions-item label="Content-Type">{{ metrics.contentType }}</el-descriptions-item>
            <el-descriptions-item label="Content-Length">{{ metrics.contentLength }}</el-descriptions-item>
            <el-descriptions-item label="ETag">{{ metrics.etag }}</el-descriptions-item>
            <el-descriptions-item label="Last-Modified">{{ metrics.lastModified }}</el-descriptions-item>
            <el-descriptions-item label="Server / Via">{{ metrics.server }}</el-descriptions-item>
            <el-descriptions-item label="HTTP protocol">{{ metrics.protocol }}</el-descriptions-item>
            <el-descriptions-item label="Header probe time">{{ metrics.headerProbeMs == null ? "Unavailable" : `${metrics.headerProbeMs.toFixed(0)} ms` }}</el-descriptions-item>
            <el-descriptions-item label="Resource transfer size">{{ formatBytes(metrics.transferSize) }}</el-descriptions-item>
            <el-descriptions-item label="Encoded body size">{{ formatBytes(metrics.encodedBodySize) }}</el-descriptions-item>
          </el-descriptions>

          <div class="headers-section">
            <h3>Response headers</h3>
            <el-table :data="responseHeaders" border empty-text="No response headers were exposed">
              <el-table-column prop="source" label="Source" min-width="160" />
              <el-table-column prop="name" label="Header" min-width="220" />
              <el-table-column prop="value" label="Value" min-width="420" />
            </el-table>
          </div>
        </template>
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<style scoped>
.test-suite-page { min-width: 0; }
.test-suite-tabs { min-height: 680px; }
.test-suite-tabs :deep(.el-tabs__header) { background: var(--el-fill-color-light); }
.test-suite-tabs :deep(.el-tabs__item) { height: 64px; padding: 0 34px; font-size: 18px; font-weight: 600; }
.test-suite-tabs :deep(.el-tabs__content) { padding: clamp(18px, 3vw, 34px); }
.asset-test-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
.asset-test-toolbar h2 { margin: 0 0 6px; }
.asset-test-toolbar p { margin: 0; color: var(--el-text-color-secondary); }
.asset-test-actions { display: flex; gap: 10px; flex: 0 0 auto; }
.asset-test-actions .el-select { width: 130px; }
.video-panel { display: grid; min-height: 360px; margin: 22px 0; place-items: center; overflow: hidden; border: 1px solid var(--el-border-color); border-radius: 8px; background: #050505; }
.download-state { display: grid; width: min(520px, calc(100% - 36px)); gap: 14px; color: #fff; text-align: center; }
.download-state .el-icon { justify-self: center; }
.download-state span { color: #c0c4cc; font-size: 13px; }
.test-video { display: block; width: 100%; max-height: 68vh; background: #000; }
.metrics-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 22px 0; }
.edge-cache-result { margin-top: 22px; }
.delivery-details { margin-top: 26px; }
.headers-section { margin-top: 26px; }
.headers-section h3 { margin: 0 0 12px; }
@media (max-width: 900px) {
  .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .asset-test-toolbar { align-items: stretch; flex-direction: column; }
}
@media (max-width: 600px) {
  .asset-test-actions { flex-direction: column; }
  .asset-test-actions .el-select { width: 100%; }
  .metrics-grid { grid-template-columns: 1fr; }
  .test-suite-tabs :deep(.el-tabs__content) { padding: 14px; }
}
</style>
