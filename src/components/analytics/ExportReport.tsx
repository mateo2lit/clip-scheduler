"use client";

import { useState } from "react";
import { FileText, DownloadSimple } from "@phosphor-icons/react/dist/ssr";

type Metric = {
  videoId: string;
  platform: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  postedAt: string;
};

type Totals = { views: number; likes: number; comments: number; shares: number };

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  bluesky: "Bluesky",
  x: "X",
};

export default function ExportReport({
  metrics,
  totals,
  range,
}: {
  metrics: Metric[];
  totals: Totals;
  range: string;
}) {
  const [exporting, setExporting] = useState(false);

  async function exportPDF() {
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(5, 5, 5);
      doc.rect(0, 0, pageWidth, 45, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.text("ClipDash Analytics Report", 20, 25);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const rangeLabel = range === "24h" ? "Last 24 Hours" : range === "1w" ? "Last 7 Days" : range === "1m" ? "Last 30 Days" : "Last Year";
      doc.text(`${rangeLabel} | Generated ${new Date().toLocaleDateString()}`, 20, 35);

      // KPI Summary
      let y = 55;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Performance Summary", 20, y);
      y += 10;

      const kpis = [
        { label: "Total Views", value: formatNum(totals.views) },
        { label: "Total Likes", value: formatNum(totals.likes) },
        { label: "Total Comments", value: formatNum(totals.comments) },
        { label: "Engagement Rate", value: totals.views > 0 ? ((totals.likes + totals.comments) / totals.views * 100).toFixed(2) + "%" : "0%" },
      ];

      doc.setFontSize(10);
      const kpiWidth = (pageWidth - 40) / kpis.length;
      kpis.forEach((kpi, i) => {
        const x = 20 + i * kpiWidth;
        doc.setFillColor(245, 245, 245);
        doc.roundedRect(x, y, kpiWidth - 5, 25, 3, 3, "F");
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(kpi.label, x + 5, y + 9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(16);
        doc.text(kpi.value, x + 5, y + 20);
        doc.setFontSize(10);
      });

      y += 35;

      // Platform breakdown
      const byPlatform = new Map<string, { posts: number; views: number; likes: number; comments: number }>();
      for (const m of metrics) {
        const existing = byPlatform.get(m.platform) || { posts: 0, views: 0, likes: 0, comments: 0 };
        existing.posts++;
        existing.views += m.views;
        existing.likes += m.likes;
        existing.comments += m.comments;
        byPlatform.set(m.platform, existing);
      }

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Platform Breakdown", 20, y);
      y += 8;

      // Table header
      doc.setFillColor(240, 240, 240);
      doc.rect(20, y, pageWidth - 40, 8, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text("Platform", 25, y + 5.5);
      doc.text("Posts", 80, y + 5.5);
      doc.text("Views", 105, y + 5.5);
      doc.text("Likes", 135, y + 5.5);
      doc.text("Comments", 160, y + 5.5);
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      for (const [platform, data] of byPlatform) {
        doc.text(PLATFORM_LABELS[platform] || platform, 25, y + 4);
        doc.text(String(data.posts), 80, y + 4);
        doc.text(formatNum(data.views), 105, y + 4);
        doc.text(formatNum(data.likes), 135, y + 4);
        doc.text(formatNum(data.comments), 160, y + 4);
        y += 7;
      }

      y += 8;

      // Top posts
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text("Top Performing Posts", 20, y);
      y += 8;

      const topPosts = [...metrics]
        .sort((a, b) => (b.views + b.likes + b.comments) - (a.views + a.likes + a.comments))
        .slice(0, 15);

      // Table header
      doc.setFillColor(240, 240, 240);
      doc.rect(20, y, pageWidth - 40, 8, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text("#", 23, y + 5.5);
      doc.text("Title", 30, y + 5.5);
      doc.text("Platform", 110, y + 5.5);
      doc.text("Views", 140, y + 5.5);
      doc.text("Likes", 160, y + 5.5);
      doc.text("Date", 175, y + 5.5);
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      topPosts.forEach((post, idx) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(String(idx + 1), 23, y + 4);
        const truncTitle = post.title.length > 45 ? post.title.slice(0, 42) + "..." : post.title;
        doc.text(truncTitle, 30, y + 4);
        doc.text(PLATFORM_LABELS[post.platform] || post.platform, 110, y + 4);
        doc.text(formatNum(post.views), 140, y + 4);
        doc.text(formatNum(post.likes), 160, y + 4);
        doc.text(new Date(post.postedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }), 175, y + 4);
        y += 7;
      });

      // Footer
      y = 285;
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text("Generated by ClipDash | clipdash.org", 20, y);
      doc.text(new Date().toISOString(), pageWidth - 60, y);

      doc.save(`clipdash-analytics-${range}-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (e: any) {
      console.error("PDF export failed:", e);
      alert("Failed to export PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function exportCSV() {
    const headers = ["Title", "Platform", "Views", "Likes", "Comments", "Shares", "Posted At"];
    const rows = metrics.map((m) => [
      `"${m.title.replace(/"/g, '""')}"`,
      m.platform,
      m.views,
      m.likes,
      m.comments,
      m.shares ?? 0,
      m.postedAt,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clipdash-analytics-${range}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportPDF}
        disabled={exporting || metrics.length === 0}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-40"
      >
        <FileText className="w-3.5 h-3.5" weight="duotone" />
        {exporting ? "Exporting..." : "PDF Report"}
      </button>
      <button
        onClick={exportCSV}
        disabled={metrics.length === 0}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-40"
      >
        <DownloadSimple className="w-3.5 h-3.5" weight="bold" />
        CSV
      </button>
    </div>
  );
}
