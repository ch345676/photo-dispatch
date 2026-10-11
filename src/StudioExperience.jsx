import { useEffect, useState } from "react";
import {
  Camera,
  Sparkles,
  ArrowUpRight,
  Upload,
  Monitor,
  ShieldCheck,
} from "lucide-react";

export const desktopEdition = import.meta.env.VITE_APP_EDITION === "desktop";
const preferenceKey = "shiguang-ui-motion-v1";
export function useStudioExperience() {
  const [motion, setMotion] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) === "calm" ? "calm" : "full";
    } catch {
      return "full";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.sgMotion = motion;
    const sync = (e) => {
      if (e.key === preferenceKey || e.key === null) {
        try {
          setMotion(
            localStorage.getItem(preferenceKey) === "calm" ? "calm" : "full",
          );
        } catch {}
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [motion]);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const press = (e) => {
      if (motion === "calm" || reduce.matches || e.button !== 0) return;
      const target = e.target.closest("button");
      if (!target || target.disabled || target.closest(".month-sheet-grid"))
        return;
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "studio-ripple";
      ripple.setAttribute("aria-hidden", "true");
      const size = Math.min(Math.max(rect.width, rect.height) * 1.8, 280);
      Object.assign(ripple.style, {
        width: size + "px",
        height: size + "px",
        left: e.clientX - rect.left - size / 2 + "px",
        top: e.clientY - rect.top - size / 2 + "px",
      });
      target.classList.add("has-studio-ripple");
      target.append(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), {
        once: true,
      });
      setTimeout(() => ripple.remove(), 700);
    };
    document.addEventListener("pointerdown", press);
    return () => document.removeEventListener("pointerdown", press);
  }, [motion]);
  return [
    motion,
    (value) => {
      setMotion(value);
      try {
        localStorage.setItem(preferenceKey, value);
      } catch {}
    },
  ];
}

export function WelcomeStudio({ onNew, onImport }) {
  return (
    <aside className="studio-welcome" aria-label="正式开始使用">
      <div className="welcome-camera" aria-hidden="true">
        <Camera size={30} />
        <i />
        <i />
      </div>
      <div className="welcome-copy">
        <span>你的下一场好作品，从这里开始</span>
        <h2>留住光，也安排好每一天。</h2>
        <p>
          当前是空白个人空间。添加伙伴、安排拍摄，所有记录只保存在
          {desktopEdition ? "这台 Mac" : "本机"}。
        </p>
      </div>
      <div className="welcome-actions">
        <button className="button primary" onClick={onNew}>
          安排第一场拍摄 <ArrowUpRight size={16} />
        </button>
        <button className="text-button" onClick={onImport}>
          <Upload size={14} />
          恢复已有备份
        </button>
      </div>
    </aside>
  );
}

export function MotionSettings({ motion, onChange }) {
  return (
    <section className="panel settings-card studio-motion-card">
      <div className="section-header">
        <h2>
          <Sparkles size={19} />
          界面与动效
        </h2>
        <span className="studio-label">STUDIO</span>
      </div>
      <p>
        让页面、日历和操作反馈更有呼吸感。系统开启“减少动态效果”时，自动关闭动画。
      </p>
      <div className="motion-choice" role="group" aria-label="动效偏好">
        <button
          aria-pressed={motion === "full"}
          onClick={() => onChange("full")}
        >
          <Sparkles size={20} />
          <strong>丰富动效</strong>
          <span>柔和转场与轻盈反馈</span>
        </button>
        <button
          aria-pressed={motion === "calm"}
          onClick={() => onChange("calm")}
        >
          <Monitor size={20} />
          <strong>简洁模式</strong>
          <span>减少移动，专注内容</span>
        </button>
      </div>
    </section>
  );
}

export function DesktopInfo() {
  return (
    <section className="panel settings-card desktop-info">
      <div className="section-header">
        <h2>
          <ShieldCheck size={19} />
          Mac 个人版
        </h2>
        <span className="studio-label">OFFLINE READY</span>
      </div>
      <p>
        应用可离线使用，正式记录保存在这台 Mac
        的应用数据目录。更新安装包不会清空记录，请继续定期导出完整备份。
      </p>
      <div className="desktop-info-note">
        <Camera size={18} />
        <span>
          首次安装从空白开始
          <br />
          <small>订单、伙伴、草稿与回收站均为空</small>
        </span>
      </div>
      <p>
        网页版与 Mac
        版各自保存数据。如需迁移，可先从网页版导出完整备份，再在这里导入。
      </p>
    </section>
  );
}
